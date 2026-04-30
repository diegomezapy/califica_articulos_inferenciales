"""
evaluar_con_gpt.py
==================
Evalua una lista de PDFs aplicando el prompt v4.1-NTK con GPT (OpenAI).
Output: CSV con columnas pdf_id,A,B,C,D,notas,revisor listo para importar
con la función importarEvaluacionesIA() del backend Apps Script.

Uso:
    export OPENAI_API_KEY=sk-...
    python3 evaluar_con_gpt.py --ids 1,2,3,4,5,6,9,74 --out evaluaciones_gpt.csv
"""
import argparse, json, os, sys, csv, time, re
from pathlib import Path
import urllib.error
import urllib.request

# ── Config ───────────────────────────────────────────────────────────────────
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
  - Articulos teoricos, matematicos, simulaciones, benchmarking de modelos/algoritmos.
  - Estudios de caso historicos, arqueologicos, textuales o de cultura material.
  - Estudios ecologicos de campo, monitoreo de fauna/flora.
  - Validacion de instrumentos psicometricos.
  - Estudios traslacionales con muestras clinicas de laboratorio cuya conclusion principal es biologica.
  - Articulos con datos censales o registros administrativos que cubren toda la poblacion.

PASO 2. CLASIFICACION PRINCIPAL
Solo si aplica_muestreo_inferencial = "Si":

FALLA FUERTE clasica - requiere las TRES condiciones simultaneamente:
  [A] Muestreo no probabilistico SIN advertencia.
  [B no presente] Sin reconocimiento explicito de la limitacion.
  [C] Extrapolacion explicita a poblacion mayor con inferencia aplicada.

FF con reconocimiento - cuando A y C se cumplen pero B (advertencia) tambien se cumple.

DEBILIDAD IMPORTANTE - cuando no se cumplen A y C juntos, pero hay problema metodologico real.

SIN FALLA RELEVANTE - muestreo apropiado, conclusiones acotadas, o ambos.

NO APLICA - no entra al universo del Paso 1.

REGLA DE AGREGACION OFICIAL: Falla fuerte = A & C (sin importar B).

Devuelve EXCLUSIVAMENTE un JSON con esta forma exacta:
{
  "aplica_muestreo_inferencial": "Si"|"No",
  "muestreo_no_probabilistico": "Si"|"No"|"No aplica",
  "advierte_limites_muestreo": "Si"|"No",
  "extrapola_a_poblacion": "Si"|"No",
  "veredicto": "FF clasica"|"FF con reconocimiento"|"Debilidad importante"|"Sin falla relevante"|"No evaluable",
  "motivo": "explicacion breve, max 200 caracteres"
}
"""

PDFS_DIR = "/Users/diegobernardomezabogado/Desktop/pdfs_auditables_346"
DATA_CSV = Path(__file__).parent / "articulos_auditables_346.csv"
MAX_CHARS = 30000


def cargar_metadata():
    rows = list(csv.DictReader(open(DATA_CSV, encoding="utf-8")))
    return {int(r["pdf_id"]): r for r in rows}


def extraer_texto(pdf_path: Path) -> str:
    """Extrae texto del PDF usando pdftotext si está, sino pypdf."""
    try:
        import subprocess
        out = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True, text=True, timeout=60
        )
        if out.returncode == 0:
            return out.stdout[:MAX_CHARS]
    except Exception:
        pass
    try:
        import pypdf
        reader = pypdf.PdfReader(str(pdf_path))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        return text[:MAX_CHARS]
    except Exception as e:
        return ""


def _leer_error_http(err: urllib.error.HTTPError) -> str:
    try:
        raw = err.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        msg = data.get("error", {}).get("message") or raw
    except Exception:
        msg = str(err)
    return f"HTTP {err.code}: {msg}"


def llamar_gpt(texto: str, modelo: str, api_key: str, max_retries: int = 5) -> dict:
    body = {
        "model": modelo,
        "messages": [
            {"role": "system", "content": PROMPT_V41},
            {"role": "user", "content": "ARTICULO:\n\n" + texto}
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"}
    }
    for intento in range(max_retries + 1):
        try:
            req = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions",
                data=json.dumps(body).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read())
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
        except urllib.error.HTTPError as e:
            detalle = _leer_error_http(e)
            if e.code == 429 and intento < max_retries:
                espera = int(e.headers.get("retry-after") or min(120, 15 * (intento + 1)))
                print(f"\n    429 OpenAI; esperando {espera}s...", file=sys.stderr, flush=True)
                time.sleep(espera)
                continue
            raise RuntimeError(detalle)
        except Exception as e:
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
    ap.add_argument("--ids", required=True, help="lista de pdf_id separados por coma")
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="gpt-5")
    ap.add_argument("--revisor", default="gpt")
    args = ap.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Falta OPENAI_API_KEY", file=sys.stderr); sys.exit(1)

    meta = cargar_metadata()
    ids = [int(x) for x in args.ids.split(",") if x.strip()]
    print(f"Procesando {len(ids)} PDFs con {args.model}...")

    rows = []
    for i, pid in enumerate(ids, 1):
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
            r = llamar_gpt(texto, args.model, api_key)
            A = to_binary(r.get("muestreo_no_probabilistico"))
            B = to_binary(r.get("advierte_limites_muestreo"))
            C = to_binary(r.get("extrapola_a_poblacion"))
            D = r.get("veredicto", "Sin falla relevante")
            motivo = (r.get("motivo") or "")[:200]
            rows.append({"pdf_id": pid, "A": A, "B": B, "C": C, "D": D,
                        "notas": motivo, "revisor": args.revisor})
            print(f"  [{i}/{len(ids)}] PDF {pid}: A={A} B={B} C={C} D={D}")
        except Exception as e:
            print(f"  [{i}/{len(ids)}] PDF {pid}: ERROR {e}", file=sys.stderr)

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["pdf_id", "A", "B", "C", "D", "notas", "revisor"])
        w.writeheader()
        w.writerows(rows)
    print(f"\nGuardado: {args.out} ({len(rows)} filas)")


if __name__ == "__main__":
    main()
