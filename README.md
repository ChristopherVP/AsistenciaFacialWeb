# Asistencia Facial (PWA)

Versión web de la aplicación de escritorio (Python + Tkinter + OpenCV): mismas pantallas, textos, colores y lógica.
Todo corre en el navegador (sin servidor ni base de datos). HTML + CSS + JavaScript (módulos ES), sin frameworks.

## 1. Poner los modelos (obligatorio)

Copie a la carpeta `modelos/` los mismos archivos que usa la versión de escritorio
(`C:\Users\SU_USUARIO\AsistenciaFacial\modelos\`):

- `face_detection_yunet_2023mar.onnx`
- `face_recognition_sface_2021dec.onnx`

## 2. Probar en su PC

Necesita HTTPS o `localhost` (cámara, criptografía y service worker lo exigen).

```bash
cd asistencia-facial-pwa
python -m http.server 8000      # o: py -m http.server 8000 en Windows
```

Abra `http://localhost:8000/diagnostico.html` y pulse **1. Cargar modelos** y **2. Probar con la cámara**:
debe detectar su rostro (score > 0.9) y dar una similitud > 0.40 entre dos capturas suyas.
Luego abra `http://localhost:8000/` (primera cuenta: «Regístrate aquí»).

Pruebas automáticas de la lógica y de la interfaz (opcional, requiere Node 20+):

```bash
npm install
npm test
```

## 3. Publicar en GitHub Pages

1. Cree un repositorio y suba **todo el contenido** de esta carpeta (incluida `modelos/` con los `.onnx`, 37 MB: permitido).
2. En el repositorio: *Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`*.
3. El enlace será `https://SU_USUARIO.github.io/NOMBRE_REPO/`. Compártalo: cada computadora lo abre y puede
   **instalarlo** (ícono de instalar en la barra de direcciones o Ajustes → Instalar aplicación) y usarlo sin internet.

Cada navegador guarda sus propios datos (IndexedDB): nada se comparte entre computadoras. Si actualiza la app,
cambie `VERSION` en `sw.js` para que los equipos descarguen la versión nueva.

## Estructura

```
index.html · manifest.webmanifest · sw.js · diagnostico.html · css/estilos.css
js/    config · errors · models · validators · scheduler · storage (IndexedDB) · auth
       face-engine (YuNet + SFace) · model-loader · enrollment · attendance · excel
       camera · voice · backup · pwa · main · ui/ (login, ventana principal, pestañas, diálogos)
modelos/ vendor/ (onnxruntime-web y SheetJS locales) icons/ tests/
```

## Diferencias con la versión de escritorio

- **Excel**: la asistencia se guarda en el navegador y el `.xlsx` se **descarga** (botón «Descargar» en Cursos).
  No hay «Cambiar…» ruta ni archivo vivo en disco. El .xlsx no trae el panel congelado.
- **Eliminar curso** también borra su asistencia guardada (descargue el Excel antes).
- **Cámara**: el navegador pide permiso antes de mostrar los nombres; «Buscar cámaras» lo solicita.
- **Listas automáticas**: la pestaña debe estar abierta; los navegadores frenan los temporizadores de pestañas ocultas.
- **Voz**: usa las voces en español instaladas en el sistema.
- **Parpadeo (liveness)**: `enrollmet.py` + `liveness.py` no se importan en su app, por eso no se portaron.
- **Extras**: exportar/importar respaldo (también acepta `curso.json` y `usuarios.json` de la versión de escritorio,
  con sus embeddings), instalar como app y página de diagnóstico.
