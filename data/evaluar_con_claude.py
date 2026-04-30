"""
evaluar_con_claude.py
=====================
Evalua una lista de PDFs aplicando el prompt v4.1-NTK con Claude (Anthropic API).
Output: CSV con columnas pdf_id,A,B,C,D,notas,revisor listo para importar
con la funcion importarEvaluacionesIA() del backend Apps Script.

Cada llamada es stateless (sin memoria entre PDFs), igual que el script de Gemini,
para que la comparacion sea metodologicamente apples-to-apples.

Uso:
    export ANTHROPIC_API_KEY=sk-ant-api...
    # piloto:
    python3 evaluar_con_claude.py --ids 1,2,3,4,5,6,7,8,9,43,56,74 \\
        --out evaluaciones_claude_haiku_piloto.csv --revisor claude_haiku
    # corpus completo:
    python3 evaluar_con_claude.py --ids ALL \\
        --out evaluaciones_claude_haiku_346.csv --revisor claude_haiku
"""
import argparse, json, os, sys, csv, time, re
from pathlib import Path
import urllib.request, urllib.error

PDFS_DIR  = "/Users/diegobernardomezabogado/Desktop/pdfs_auditables_346"
DATA_CSV  = Path(__file__).parent / "articulos_auditables_346.csv"
MAX_CHARS = 30000

PROMPT_V41 = """Eres un metodologo experto en investigacion cientifica cuantitativa.
Tu tarea es clasificar articulos cientificos segun fallas en diseno muestral e inferencia estadistica.

PASO 1. ELEGIBILIDAD
Decide si el articulo pertenece al universo analitico de una auditoria de muestreo inferencial.

Usa aplica_muestreo_inferencial = "Si" solo si:
  - el articulo usa inferencia estadistica;
  - y existe una pregunta real sobre muestreo o base inferencial de unidades observacionales
    relevantes para una poblacion objetivo humana o animal en sentido epidemiologico/social.

Usa aplica_muestreo_inferencial = "No" cuando el articulo sea:
  - Meta-analisis, revisiones sistematicas.
  - Series temporales o paneles exhaustivos sin problema muestral clasico.
  - Experimentos de laboratorio, in vitro, ex vivo o con animales de laboratorio.
  - Articulos teoricos, matematicos, simulaciones.
  - Estudios de caso historicos, arqueologicos.
  - Estudios ecologicos de campo, monitoreo de fauna/flora, transectos ambientales,
    analisis de biodiversidad o censos ecologicos donde el muestreo es el estandar
    del campo y no representa personas u organizaciones.
  - Estudios de validacion de instrumentos psicometricos.
  - Estudios traslacionales con muestras clinicas de laboratorio cuya conclusion
    principal es biologica.
  - Articulos con datos censales o registros administrativos que cubren toda la poblacion.

PASO 2. CLASIFICACION PRINCIPAL
Solo si aplica_muestreo_inferencial = "Si":

FALLA FUERTE (regla operacional A & C):
  [A] Muestreo no probabilistico (conveniencia, voluntarios, bola de nieve, intencional, consecutivo).
  [C] Extrapolacion explicita a poblacion mayor con inferencia aplicada.
Subdivisiones:
  - "FF clasica" = A & C & B=No (no advierten la limitacion).
  - "FF con reconocimiento" = A & C & B=Si (advierten pero generalizan igual).

DEBILIDAD IMPORTANTE: hay problema metodologico real pero NO se cumplen A & C juntos.
SIN FALLA RELEVANTE: muestreo apropiado, conclusiones acotadas, o ambos.
NO APLICA: no entra al universo del Paso 1.

Devuelve EXCLUSIVAMENTE un JSON con:
{
  "aplica_muestreo_inferencial": "Si"|"No",
  "muestreo_no_probabilistico": "Si"|"No"|"No aplica",
  "advierte_limites_muestreo": "Si"|"No",
  "extrapola_a_poblacion": "Si"|"No",
  "veredicto": "FF clasica"|"FF con reconocimiento"|"Debilidad importante"|"Sin falla relevante"|"No aplica",
  "motivo": "explicacion breve, max 200 caracteres"
}
"""


def cargar_metadata():
    rows = list(csv.DictReader(open(DATA_CSV, encoding="utf-8")))
    return {int(r["pdf_id"]): r for r in rows}


def extraer_texto(pdf_path: Path) -> str:
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            text = "\n".join((p.extract_text() or "") for p in pdf.pages)
        if text.strip():
            return text[:MAX_CHARS]
    except Exception:
        pass
    try:
        import pypdf
        r = pypdf.PdfReader(str(pdf_path))
        return "\n".join((p.extract_text() or "") for p in r.pages)[:MAX_CHARS]
    except Exception:
        return ""


def llamar_claude(texto: str, modelo: str, api_key: str, max_retries: int = 2) -> dict:
    body = {
        "model": modelo,
        "max_tokens": 800,
        "temperature": 0,
        "system": PROMPT_V41,
        "messages": [{"role": "user", "content": "ARTICULO:\n\n" + texto}]
    }
    last_err = None
    for intento in range(max_retries + 1):
        try:
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=json.dumps(body).encode("utf-8"),
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                }, method="POST"
            )
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.loads(r.read())
            txt = d["content"][0]["text"]
            m = re.search(r"\{.*\}", txt, re.DOTALL)
            if not m:
                raise RuntimeError("respuesta sin JSON: " + txt[:200])
            return json.loads(m.group(0))
        except Exception as e:
            last_err = e
            if intento == max_retries:
                raise
            time.sleep(5 * (intento + 1))


def to_binary(v):
    s = str(v or "").strip().lower()
    if s in ("si", "sí", "yes", "y", "1", "true"): return "1"
    if s in ("no", "n", "0", "false"): return "0"
    return "0"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", required=True,
                    help="lista de pdf_id separados por coma, o ALL para los 346")
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="claude-haiku-4-5",
                    help="modelo Anthropic (default: claude-haiku-4-5)")
    ap.add_argument("--revisor", default="claude_haiku")
    ap.add_argument("--sleep", type=float, default=0.5,
                    help="segundos de espera entre llamadas")
    args = ap.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Falta ANTHROPIC_API_KEY", file=sys.stderr); sys.exit(1)

    meta = cargar_metadata()
    if args.ids.strip().upper() == "ALL":
        ids = sorted(meta.keys())
    else:
        ids = [int(x) for x in args.ids.split(",") if x.strip()]
    print(f"Procesando {len(ids)} PDFs con {args.model} (revisor={args.revisor})...")

    # Modo append: si el CSV ya existe, retomar desde donde quedo
    rows = []
    ya_hechos = set()
    out_path = Path(args.out)
    if out_path.exists():
        with open(out_path, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                rows.append(r)
                ya_hechos.add(int(r["pdf_id"]))
        print(f"  CSV existente: {len(rows)} filas previas. Salto los ya hechos.")

    pendientes = [i for i in ids if i not in ya_hechos]
    print(f"  Pendientes: {len(pendientes)}")

    t0 = time.time()
    for k, pid in enumerate(pendientes, 1):
        m = meta.get(pid)
        if not m:
            print(f"  {pid}: NO EN METADATA", file=sys.stderr); continue
        pdf_path = Path(PDFS_DIR) / m["pdf_nombre"]
        if not pdf_path.exists():
            print(f"  {pid}: PDF no en disco ({m['pdf_nombre']})", file=sys.stderr); continue
        texto = extraer_texto(pdf_path)
        if not texto.strip():
            print(f"  {pid}: PDF sin texto extraible", file=sys.stderr); continue

        try:
            r = llamar_claude(texto, args.model, api_key)
            A = to_binary(r.get("muestreo_no_probabilistico"))
            B = to_binary(r.get("advierte_limites_muestreo"))
            C = to_binary(r.get("extrapola_a_poblacion"))
            D_in = (r.get("veredicto") or "").strip()
            D = {"No aplica": "No evaluable"}.get(D_in, D_in)
            motivo = (r.get("motivo") or "")[:200]
            row = {"pdf_id": pid, "A": A, "B": B, "C": C, "D": D,
                   "notas": motivo, "revisor": args.revisor}
            rows.append(row)
            elapsed = time.time() - t0
            eta = elapsed / k * (len(pendientes) - k)
            print(f"  [{k}/{len(pendientes)}] PDF {pid}: A={A} B={B} C={C} D={D}  "
                  f"(elapsed={elapsed:.0f}s eta={eta:.0f}s)")
            # Guardado incremental cada 10 evaluaciones
            if k % 10 == 0:
                with open(out_path, "w", newline="", encoding="utf-8") as f:
                    w = csv.DictWriter(f, fieldnames=["pdf_id","A","B","C","D","notas","revisor"])
                    w.writeheader(); w.writerows(rows)
            if args.sleep > 0:
                time.sleep(args.sleep)
        except Exception as e:
            print(f"  [{k}/{len(pendientes)}] PDF {pid}: ERROR {e}", file=sys.stderr)

    # Guardado final
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["pdf_id","A","B","C","D","notas","revisor"])
        w.writeheader(); w.writerows(rows)
    print(f"\nGuardado: {args.out} ({len(rows)} filas, {time.time()-t0:.0f}s)")


if __name__ == "__main__":
    main()
