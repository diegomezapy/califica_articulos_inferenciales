"""
evaluar_con_gemini.py
=====================
Re-evalua una lista de PDFs con Gemini 2.5 Flash usando el prompt v4.1-NTK
y una key especifica.

Uso:
    export GOOGLE_API_KEY=AIzaSy...
    python3 evaluar_con_gemini.py --ids 1,2,3 --out evaluaciones_gemini.csv --revisor gemini_v2
"""
import argparse, json, os, sys, csv, time
from pathlib import Path
import urllib.request, urllib.error

PDFS_DIR = "/Users/diegobernardomezabogado/Desktop/pdfs_auditables_346"
DATA_CSV = Path(__file__).parent / "articulos_auditables_346.csv"
MAX_CHARS = 30000
MODELO = "gemini-2.5-flash"

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
        return text[:MAX_CHARS]
    except Exception:
        try:
            import pypdf
            r = pypdf.PdfReader(str(pdf_path))
            return "\n".join((p.extract_text() or "") for p in r.pages)[:MAX_CHARS]
        except Exception:
            return ""


def llamar_gemini(texto: str, api_key: str, max_retries: int = 2) -> dict:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODELO}:generateContent?key={api_key}"
    body = {
        "contents": [{"parts": [{"text": PROMPT_V41 + "\n\nARTICULO:\n\n" + texto}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json"
        }
    }
    for intento in range(max_retries + 1):
        try:
            req = urllib.request.Request(
                url, data=json.dumps(body).encode("utf-8"),
                headers={"Content-Type": "application/json"}, method="POST"
            )
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.loads(r.read())
            if "error" in d:
                raise RuntimeError(json.dumps(d["error"]))
            content = d["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(content)
        except Exception as e:
            if intento == max_retries: raise
            time.sleep(5 * (intento + 1))


def to_binary(v):
    s = str(v or "").strip().lower()
    if s in ("si", "sí", "yes", "y", "1", "true"): return "1"
    if s in ("no", "n", "0", "false"): return "0"
    return "0"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--revisor", default="gemini_v2")
    args = ap.parse_args()

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("Falta GOOGLE_API_KEY", file=sys.stderr); sys.exit(1)

    meta = cargar_metadata()
    ids = [int(x) for x in args.ids.split(",") if x.strip()]
    print(f"Procesando {len(ids)} PDFs con {MODELO} (revisor={args.revisor})...")

    rows = []
    for i, pid in enumerate(ids, 1):
        m = meta.get(pid)
        if not m: print(f"  {pid}: NO EN METADATA", file=sys.stderr); continue
        pdf_path = Path(PDFS_DIR) / m["pdf_nombre"]
        if not pdf_path.exists():
            print(f"  {pid}: PDF no en disco", file=sys.stderr); continue
        texto = extraer_texto(pdf_path)
        if not texto.strip():
            print(f"  {pid}: PDF sin texto", file=sys.stderr); continue
        try:
            r = llamar_gemini(texto, api_key)
            A = to_binary(r.get("muestreo_no_probabilistico"))
            B = to_binary(r.get("advierte_limites_muestreo"))
            C = to_binary(r.get("extrapola_a_poblacion"))
            D_in = (r.get("veredicto") or "").strip()
            mapa = {"No aplica": "No evaluable"}  # alinear con CATEGORIAS_D del backend
            D = mapa.get(D_in, D_in)
            motivo = (r.get("motivo") or "")[:200]
            rows.append({"pdf_id": pid, "A": A, "B": B, "C": C, "D": D,
                        "notas": motivo, "revisor": args.revisor})
            print(f"  [{i}/{len(ids)}] PDF {pid}: A={A} B={B} C={C} D={D}")
            time.sleep(1)  # ratelimit cortes
        except Exception as e:
            print(f"  [{i}/{len(ids)}] PDF {pid}: ERROR {e}", file=sys.stderr)

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["pdf_id","A","B","C","D","notas","revisor"])
        w.writeheader(); w.writerows(rows)
    print(f"\nGuardado: {args.out} ({len(rows)} filas)")


if __name__ == "__main__":
    main()
