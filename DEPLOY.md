# Despliegue de califica_articulos_inferenciales

Pasos para tener la app funcionando desde cero, sincronizada con este repo de GitHub.

## 1. Pre-requisitos

- Cuenta de Google con la carpeta de Drive de los 346 PDFs ya accesible.
- [Node.js](https://nodejs.org) instalado (necesario para `clasp`).
- Repo clonado localmente:
  ```bash
  git clone https://github.com/diegomezapy/califica_articulos_inferenciales.git
  cd califica_articulos_inferenciales
  ```

## 2. Subir el CSV de ground truth a Drive

```
data/articulos_auditables_346.csv
```

Subí ese archivo a tu Google Drive (no a una subcarpeta sensible — donde te quede
cómodo). Después del upload, abrílo, click derecho → *Compartir* → *Copiar enlace*.
La URL tiene esta forma:

```
https://drive.google.com/file/d/AABBCC11223344/view?usp=sharing
                              ^^^^^^^^^^^^^^^^
                              este es el FILE ID
```

Anotá ese **FILE ID**. Lo necesitás en el paso 5.

## 3. Instalar y autenticar `clasp`

```bash
npm install -g @google/clasp
clasp login
```

`clasp login` abre un navegador para que autorices acceso a Apps Script con tu cuenta.
Habilita la API en https://script.google.com/home/usersettings (toggle "Google Apps
Script API" en ON).

## 4. Crear el proyecto Apps Script y subir el código

```bash
cd apps_script
clasp create --type webapp --title "califica_articulos_inferenciales"
clasp push -f
```

Eso crea el proyecto en Google Apps Script y sube los 4 archivos (`appsscript.json`,
`Code.gs`, `Index.html`, `DashboardStats.html`, `styles.html`).

`clasp create` genera un `.clasp.json` local que **no se commitea** (está en
`.gitignore`). Anotá el `scriptId` que imprime — lo vas a usar para abrir el editor
web cuando lo necesites.

## 5. Configurar los IDs en `Code.gs`

Abrí el editor web del proyecto:

```bash
clasp open
```

En `Code.gs`, edita las dos constantes vacías:

```javascript
const FOLDER_ID    = '16qV-NvEplMmXI0ZELAr6TW0C05fMw-Jq'; // ya viene completo
const SHEET_ID     = '';                                  // ← rellenar tras paso 6
const CSV_FILE_ID  = 'PEGAR_AQUÍ_FILE_ID_DEL_PASO_2';
```

Guardá (Ctrl/Cmd+S).

## 6. Ejecutar `setup_inicial()` una sola vez

En el editor de Apps Script, en la barra superior elegí la función `setup_inicial`
del dropdown y dale al botón **Ejecutar**. La primera vez te va a pedir autorizar
los scopes (Drive + Sheets + UI). Aceptá.

Cuando termine, abre la pestaña **Ejecuciones** (icono ⏱ a la izquierda) y mira el
log de la última ejecución. Vas a ver una línea tipo:

```
SHEET creado: 1aBcDeFgHiJk... (pega este ID en SHEET_ID)
```

Copia ese ID y pegalo en la constante `SHEET_ID` de `Code.gs`. Guardá.

Si querés sincronizar el cambio al repo local:

```bash
clasp pull -f
git add apps_script/Code.gs
git commit -m "config: rellenar SHEET_ID y CSV_FILE_ID"
git push
```

(Recordá que **no** debes commitear los IDs reales si querés mantenerlos privados.
Por defecto este repo expone `Code.gs` con las constantes vacías para que cada quien
ponga sus propios IDs en su copia desplegada.)

## 7. Desplegar la Web App

En el editor de Apps Script:

- **Implementar → Nueva implementación**.
- Tipo: **Aplicación web**.
- Descripción: `v0.1 — doble ciego inicial`.
- Ejecutar como: **Yo (tu correo)**.
- Quién tiene acceso: **Solo yo**.
- *Implementar*.

Te da una URL tipo `https://script.google.com/macros/s/AKfycb.../exec`. Esa es la app.

Para actualizaciones posteriores: **Implementar → Gestionar implementaciones →
editar la existente → seleccionar nueva versión**.

## 8. Sincronización GitHub ↔ Apps Script

| Acción | Comando |
|---|---|
| Subir cambios locales (de tu IDE) al proyecto Apps Script | `clasp push -f` |
| Bajar cambios hechos en el editor web a tu repo local | `clasp pull -f` |
| Abrir el editor web del proyecto | `clasp open` |
| Ver logs de ejecución | `clasp logs` |

Workflow típico:

1. Edita los archivos en tu IDE preferido.
2. `clasp push -f` para subir.
3. Recarga la URL de la app web (no necesita re-deploy si solo editaste HTML).
4. Cuando estás conforme, `git commit && git push`.

## 9. Calificación: el flujo

1. Abrí la URL de la web app.
2. Te muestra el primer PDF auditable y el formulario al lado.
3. Califica A/B/C/D + notas opcionales. Submit.
4. Aparece el contraste con la IA.
5. Click **Siguiente PDF →**. Loop.
6. En cualquier momento, click en **Ver estadísticas →** (esquina superior derecha)
   para ver acuerdo, kappa y matriz de confusión sobre lo calificado hasta ahora.
7. La app recuerda dónde te quedaste (lee de la hoja `calificaciones` qué PDFs
   ya tienen un registro y muestra el siguiente pendiente).

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| "PDF no encontrado en Drive" | El nombre del archivo no coincide exactamente | Verifica que el `pdf_nombre` del CSV coincida con el nombre real en Drive |
| Error de scopes al ejecutar `setup_inicial` | Falta autorizar Drive/Sheets | Aceptar todos los permisos al primer prompt |
| `clasp push` falla con "User does not have script.deployments permission" | Cuenta sin API habilitada | https://script.google.com/home/usersettings |
| Web app pide login cada vez | `access: ANYONE` no aplicable a cuenta personal | Mantener `MYSELF` y aceptar el login una vez |
