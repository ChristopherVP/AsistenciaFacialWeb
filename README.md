# 📸 Asistencia Facial (Face Attendance PWA)

**A browser-based attendance system with face recognition, written in plain HTML, CSS and JavaScript (ES modules), with course management, automatic attendance lists, an editable Excel-style sheet, Excel import/export and offline use as an installable PWA. Everything runs in the browser: no server, no database, no framework.**

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES%20Modules-F7DF1E?logo=javascript&logoColor=black)
![ONNX](https://img.shields.io/badge/ONNX%20Runtime-Web-005CED?logo=onnx&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Offline%20ready-5A0FC8?logo=pwa&logoColor=white)
![Storage](https://img.shields.io/badge/Storage-IndexedDB-blue)
![Status](https://img.shields.io/badge/Status-Educational%20project-green)

Asistencia Facial is a web port of a desktop application (Python + Tkinter + OpenCV) that keeps the same screens, texts, colors and logic. Teachers create **courses**, register each student's face once, and then take attendance by pointing the camera at the classroom: students are recognized on-device and marked present in an attendance book that behaves like an Excel sheet. Faces are detected with **YuNet** and recognized with **SFace**, both ONNX models executed in the browser by **onnxruntime-web**, so no image ever leaves the computer.

The whole app is static (HTML + CSS + JS) and has no build step. Spreadsheets are read and written with a local copy of SheetJS (`xlsx-js-style`), and the face models run with a local copy of onnxruntime-web, so after the first visit the app works **without internet**.

---

## Table of Contents

1. [Features at a Glance](#-features-at-a-glance)
2. [Project Requirements](#-project-requirements)
3. [Installation and Setup](#-installation-and-setup)
4. [Running the Application](#-running-the-application)
5. [Publishing (GitHub Pages / Netlify)](#-publishing-github-pages--netlify)
6. [User Guide](#-user-guide)
7. [Excel Sheet View](#-excel-sheet-view)
8. [How Face Recognition Works](#-how-face-recognition-works)
9. [Security and Privacy](#-security-and-privacy)
10. [Validation Rules](#-validation-rules)
11. [Domain Model and Modules](#-domain-model-and-modules)
12. [Persistence: IndexedDB and Backups](#-persistence-indexeddb-and-backups)
13. [Project Structure](#-project-structure)
14. [Testing](#-testing)
15. [Architecture and Design Notes](#-architecture-and-design-notes)
16. [Known Limitations](#-known-limitations)
17. [Troubleshooting](#-troubleshooting)
18. [Author, Repository and License](#-author-repository-and-license)

---

## ✨ Features at a Glance

**Accounts**
- Registration with username, password, full name, validated Ecuadorian *cédula* and a **security question**.
- Login with show/hide password, **one-click login** for remembered users on a trusted computer, and **password recovery** through the security question.
- Temporary lock (30 s) after 5 failed login attempts.

**Courses and students**
- Create, rename and delete **courses**; each course has its own student list, schedule and attendance sheet.
- **Student registration with face scan**: guided capture of 5 frontal samples with on-screen progress and **voice instructions** (Web Speech API), consent checkbox and automatic **duplicate-face detection** across all courses.
- Students are always listed **alphabetically by surname (A–Z)**.
- Students imported from Excel stay **pending** (`⏳ Falta rostro`) until they finish their face scan with the **✔ Terminar registro** button.

**Attendance**
- **Take attendance** with a live camera view: faces are boxed, named and confirmed after several consecutive frames before being marked present.
- Three **precision levels** (Flexible, Balanced, Strict) to trade off ease of recognition against false matches.
- **Automatic lists**: define weekly time slots per course and the app opens and closes the list by itself while the tab is open.
- Live counters, on-screen and spoken notices, and a confirmation before leaving with a list in progress.

**Excel**
- One attendance book per course: a column per list (date and time), `1` = present, `0` = absent, and a **% Asistencia** formula, exactly like the desktop version.
- **Editable Excel-style sheet** (`excel.html`): edit cells, add columns such as *Participación*, write formulas, add or delete rows and columns, hide and show them with the right-click menu.
- **Import another Excel**: students, dates and extra columns are read and merged, sorted by surname (A–Z) and by date.
- **Download** a styled `.xlsx`; the downloaded file is a copy, so editing it never affects the program's data.

**Settings and maintenance**
- Camera chooser with live preview, ignoring virtual cameras (OBS and similar).
- **Export / import backups** (`.json`), also accepting `curso.json` and `usuarios.json` from the desktop version (with their embeddings).
- **Diagnostics page** (`diagnostico.html`) to check models, camera, detection score and similarity.
- **Installable PWA**, usable offline after the first visit.

---

## 📋 Project Requirements

### Functional requirements

| ID | Requirement |
|----|-------------|
| FR-01 | Register users with username, password, full name, valid cédula and security question; reject duplicates. |
| FR-02 | Authenticate users, allow logout, remember a user for one-click login and recover the password with the security question. |
| FR-03 | Create, rename and delete courses with unique names. |
| FR-04 | Register students with cédula, name and a guided face scan of 5 frontal samples; reject duplicated cédulas and already-registered faces. |
| FR-05 | Recognize students through the camera and mark them present after consecutive confirmations. |
| FR-06 | Let the user choose between Flexible, Balanced and Strict recognition. |
| FR-07 | Define weekly time slots per course and run **automatic attendance lists** inside them. |
| FR-08 | Keep one attendance book per course with one column per list and a percentage formula. |
| FR-09 | Show the book in an **Excel-style sheet** with editable cells, extra columns, basic formulas (`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT` and arithmetic), row/column insertion and deletion. |
| FR-10 | Hide rows and columns and restore them from a context menu. |
| FR-11 | Import another `.xlsx`, keeping its students, dates and extra columns, ordered by surname (A–Z) and by date. |
| FR-12 | Mark imported students as **pending** until they complete their face registration. |
| FR-13 | Download the attendance book as `.xlsx`; the file must be independent from the stored data. |
| FR-14 | Return from the Excel view to the program **without losing the session**. |
| FR-15 | Export and import full backups, including desktop-version data. |
| FR-16 | Choose and preview the camera and ignore virtual cameras. |
| FR-17 | Work offline and be installable as a PWA. |

### Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | **No frameworks and no build step**: plain HTML, CSS and modern JavaScript (`const/let`, `async/await`, ES modules). |
| NFR-02 | **Privacy first**: all processing happens on the user's device; only face **embeddings** (not photos) are stored, locally. |
| NFR-03 | **Offline-ready**: a service worker caches the app, the ONNX models and the vendored libraries. |
| NFR-04 | **Accessible, responsive UI**: semantic HTML, ARIA roles on tabs, dialogs and live regions, keyboard navigation. |
| NFR-05 | **Explicit error handling**: typed errors (`ValidationError`, `StorageError`, `AttendanceError`, `AuthError`…) and no silent failures. |
| NFR-06 | **Input safety**: every input is validated at the system boundary; passwords are never stored in clear text. |
| NFR-07 | **Immutable-style domain**: `createCourse`, `courseAddStudent`… return new frozen objects instead of mutating state. |
| NFR-08 | **Language**: the user interface and messages are in **Spanish**. |

### Software requirements

| Requirement | Details |
|-------------|---------|
| **Browser** | A recent **Chrome, Edge or Firefox** (WebAssembly, `getUserMedia`, IndexedDB and Service Workers). |
| **Context** | `https://` or `http://localhost` (camera, Web Crypto and service workers require a secure context). |
| **Camera** | Any webcam; frontal, well-lit faces work best. |
| **Models** | `face_detection_yunet_2023mar.onnx` (~230 KB) and `face_recognition_sface_2021dec.onnx` (~37 MB) inside `modelos/`. |
| **Local server** | Any static server, e.g. `python -m http.server 8000`. |
| **Tests** *(optional)* | **Node.js 20+**. |

---

## 🔧 Installation and Setup

```bash
# 1. Clone the repository
git clone https://github.com/ChristopherVP/AsistenciaFacialWeb.git
cd AsistenciaFacialWeb
```

The two ONNX models must be in `modelos/` (they are the same ones the desktop version uses). If you download them again from the [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models), use **“Download raw file”**; “Save as” on the GitHub page saves an HTML file and the app will refuse to load it.

```text
modelos/
├── face_detection_yunet_2023mar.onnx
└── face_recognition_sface_2021dec.onnx
```

No `npm install` is needed to use the app. It is only required to run the tests (see [Testing](#-testing)).

---

## ▶️ Running the Application

The app must be served over `localhost` or HTTPS; opening `index.html` by double-click (`file://`) does **not** work.

```bash
# Windows
py -m http.server 8000
# or, if "py" is not recognized
python -m http.server 8000

# Linux / macOS
python3 -m http.server 8000
```

1. Open `http://localhost:8000/diagnostico.html`, press **1. Cargar modelos** and **2. Probar con la cámara**. It should detect your face with a score above 0.9 and give a similarity above 0.40 between two captures of the same person.
2. Open `http://localhost:8000/` and create the first account with **«Regístrate aquí»**.
3. Stop the server with `Ctrl + C` when you finish.

> If you changed files and still see the old version, the service worker is serving its cache: hard-reload with `Ctrl + Shift + R`, unregister it in *DevTools → Application → Service Workers*, or increase `VERSION` in `sw.js`.

---

## 🌐 Publishing (GitHub Pages / Netlify)

The project is 100 % static, so publishing only means serving the folder over HTTPS.

**GitHub Pages**
1. Upload the **whole folder** (including `modelos/`, 37 MB, which is allowed).
2. *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
3. The link will be `https://YOUR_USER.github.io/AsistenciaFacialWeb/`.

**Netlify**
1. *Add new site → Deploy manually* and drag the folder, or connect the repository.
2. Leave the build command empty and publish the root directory.

After publishing:
- Every computer can open the link and **install** the app (install icon in the address bar) to use it offline.
- **Each browser and each domain keeps its own data** (IndexedDB). Data created on `localhost` does not appear on the published site: export a backup from *Ajustes* and import it there.
- When you update the app, increase `VERSION` in `sw.js` so installed copies download the new files.

---

## 🧭 User Guide

1. **Register and log in** — create your account (the first one starts from «Regístrate aquí»). Mark *«Entrar con un clic»* in *Ajustes* to log in from a saved card next time.
2. **Create a course** — *📚 Cursos → Nuevo curso*. Each course gets its own Excel.
3. **Register students** — select the course and press **➕ Agregar estudiante**. Enter the cédula and the full name, accept the consent, press **Iniciar escaneo facial** and look at the camera: the system captures 5 frontal samples and guides you by voice.
4. **Set a schedule** *(optional)* — add time slots (days and hours) and turn on the automatic list.
5. **Take attendance** — *📷 Tomar lista*: choose the course, press start and let the camera recognize the students. Press **■ Finalizar y guardar** to close the list; absent students are saved as `0`.
6. **View or download the Excel** — *📚 Cursos → 👁 Ver Excel* opens the sheet in another tab; **⬇ Descargar** downloads the `.xlsx`.
7. **Import students** — in the Excel view press **⬆ Importar Excel**. New students appear in *Cursos* marked `⏳ Falta rostro`; select one and press **✔ Terminar registro** to scan the face.
8. **Settings** — *⚙ Ajustes*: choose the camera, the recognition precision, and export or import backups.

---

## 📊 Excel Sheet View

Opened from *Cursos → Ver Excel* (`excel.html`). It behaves like a small spreadsheet and **saves every change** in the browser.

| Action | How |
|--------|-----|
| **Edit a cell** | Click it, type and press Enter. Attendance cells accept only `0`, `1` or empty. |
| **Add an extra column** | **➕ Columna** (e.g. *Participación*). |
| **Formulas** | In an extra column write `=SUM(D2:F2)`, `=AVERAGE(D2:D40)`, `=MIN(...)`, `=MAX(...)`, `=COUNT(...)` or `=D2+E2*2`. Only numbers, operators and those functions are accepted. |
| **Add a student** | **➕ Estudiante**: it is added to the sheet and to the course as *pending face registration*. |
| **Delete a row or column** | Right-click → *Eliminar* (the first three columns are fixed). Deleting a row removes it only from the Excel, not from the course. |
| **Hide / show** | Right-click a header, a row number or a cell → *Ocultar* / *Mostrar columnas y filas ocultas*, or press **👁 Mostrar todo**. |
| **Import** | **⬆ Importar Excel** reads *Cédula*, *Apellidos y nombres* (or separate *Apellidos* / *Nombres*), date columns and any other column as an extra one. Rows with an invalid cédula are skipped and reported. |
| **Download** | **⬇ Descargar .xlsx** creates a styled copy. Editing the downloaded file does **not** change the program's data. |
| **Back** | **← Volver al programa** closes the tab and returns to the program with your session intact. |

The sheet refreshes itself every 2 seconds while you are not editing, so lists taken in the program appear automatically.

---

## 🧠 How Face Recognition Works

| Stage | Detail |
|-------|--------|
| **Detection** | **YuNet** (ONNX) finds faces in each frame; faces below a score of 0.85 are ignored (registration requires ≥ 0.9). |
| **Embedding** | **SFace** (ONNX) turns each face into a 128-value vector (*embedding*). |
| **Matching** | Cosine similarity between the live embedding and every stored sample; the student with the best sample wins, and the runner-up must be at least `margin` behind to avoid ambiguous matches. |
| **Confirmation** | A student is marked present only after N **consecutive** frames, to avoid accidental matches. |
| **Registration** | 5 samples taken every 0.6 s, only from **frontal** faces (limited yaw and roll), with a 60 s timeout and spoken reminders. |
| **Duplicate check** | A face already registered under another cédula, in any course, is rejected. |

| Precision level | Threshold | Margin | Frames | Use it when |
|-----------------|-----------|--------|--------|-------------|
| **Flexible** | 0.33 | 0.00 | 2 | students are not being recognized |
| **Balanced** *(default)* | 0.40 | 0.05 | 3 | most cases |
| **Strict** | 0.50 | 0.10 | 5 | people are being confused with each other |

Processing runs in WebAssembly on the user's device (every second frame at ~30 fps), so no image or video is ever uploaded.

---

## 🔐 Security and Privacy

| Area | Implementation |
|------|----------------|
| **Passwords** | Never stored in clear text: **PBKDF2-WithHmac-SHA256**, 200,000 iterations, random 16-byte salt (Web Crypto API). Constant-time comparison. |
| **Security answers** | Hashed with the same scheme. |
| **Brute force** | 5 failed logins lock the account for 30 s (in memory). |
| **Biometric data** | Only **face embeddings** are stored (numeric vectors), never photos or video. They never leave the browser. |
| **Consent** | Registering a face requires accepting a consent notice. |
| **Local data** | All data lives in the browser's IndexedDB; whoever has access to that browser profile has access to the data. |
| **Excel formulas** | The evaluator accepts only digits, operators, parentheses and a short list of functions, so typed formulas cannot run arbitrary code. |
| **No secrets in code** | There are no keys, tokens or passwords in the source; there is no backend. |

> Face embeddings are biometric personal data. Use the app with the informed consent of the people involved and follow your institution's data-protection rules.

---

## ✅ Validation Rules

| Field | Rule |
|-------|------|
| **Cédula** | Exactly 10 digits, numeric only, province code 01–24, third digit ≤ 5 and valid check digit; unique per course. |
| **Names** | Only letters (including accents and ñ) and spaces, up to 60 characters. |
| **Username** | 4–20 characters, lowercase letters, digits, `.` and `_`, starting with a letter. |
| **Password** | 8–64 characters; must match its confirmation. |
| **Security answer** | At least 3 characters. |
| **Course name** | Not empty, up to 60 characters, unique (case-insensitive). |
| **Schedule slot** | At least one weekday; end time later than start time (`HH:MM`). |
| **Attendance cell** | `0`, `1` or empty. |
| **Imported file** | Needs a *Cédula* column and a name column; rows with an invalid cédula or without name are skipped and reported. |
| **Face registration** | Frontal faces only, score ≥ 0.9, 5 samples, 60 s limit, no duplicate face. |
| **Recognition threshold** | Limited to the range 0.30–0.80. |

---

## 🧩 Domain Model and Modules

| Module | Responsibility |
|--------|----------------|
| `models.js` | Immutable domain: `createStudent`, `createCourse`, `createSlot`, schedule helpers and `courseFromDict` (also reads desktop-version JSON). |
| `validators.js` / `errors.js` | Input validation (cédula, names, username, password) and typed errors. |
| `auth.js` | `UserRepository`: PBKDF2 hashing, login throttling, remembered users, password recovery. |
| `storage.js` | IndexedDB wrapper and repositories: `CourseRepository`, `BookRepository`, `SettingsRepository`. |
| `face-engine.js` | YuNet + SFace inference with onnxruntime-web, embeddings and `Gallery` matching. |
| `model-loader.js` | Loads and validates the ONNX models with progress reporting. |
| `enrollment.js` | `FaceEnrollment`: guided capture of frontal samples with timeouts and prompts. |
| `attendance.js` | `AttendanceSession` (consecutive-frame confirmation) and `AttendanceBook` (columns and marks per course). |
| `scheduler.js` | Weekly slots: active slot, due courses and next automatic list. |
| `sheet-model.js` | Pure logic of the editable sheet: cells, extra columns, formulas, hiding, sorting and import merge. |
| `excel.js` / `excel-import.js` | Styled `.xlsx` export and `.xlsx` import (SheetJS). |
| `excel-view.js` | UI of the Excel-style sheet and its context menu. |
| `camera.js` / `voice.js` | Camera enumeration and drawing; speech synthesis. |
| `backup.js` | Full JSON backup export and import. |
| `pwa.js` / `sw.js` | Service worker registration, install button and offline cache. |
| `ui/` | Login, main window, tabs (attendance, courses, settings), dialogs and widgets built with a tiny `h()` DOM helper. |

**How attendance is stored:** each course has one *book* with `rows` (cédula + name), `columns` (one per list, with its time and the `1`/`0` marks) and optional `extras` (custom columns). The percentage is computed as `SUM / COUNT` of the cells that have data, the same formula the exported `.xlsx` contains.

---

## 💾 Persistence: IndexedDB and Backups

| Store | Content |
|-------|---------|
| `courses` | Courses with students (cédula, name, face embeddings), slots and automatic-list state. |
| `books` | Attendance book per course (rows, columns, extra columns, hidden rows/columns). |
| `settings` | Camera, recognition threshold and preferences. |
| `users` | Accounts with salted PBKDF2 hashes. |

- The browser is asked for **persistent storage** so it does not discard the data when disk space is low.
- **Backups:** *Ajustes → Exportar respaldo* writes `AsistenciaFacial_respaldo_AAAA-MM-DD.json` with all four stores; *Importar respaldo* restores it.
- Two tabs of the app stay in sync through a `BroadcastChannel` (for example, students imported from the Excel view appear immediately in *Cursos*).
- **Deleting a course also deletes its stored attendance**: download the Excel first if you need it.

> Clearing the browser's site data erases everything. Export a backup regularly.

---

## 🧱 Project Structure

```text
AsistenciaFacialWeb/
├── index.html                  # Main app (splash + login + tabs)
├── excel.html                  # Editable Excel-style sheet
├── diagnostico.html            # Models / camera / similarity diagnostics
├── manifest.webmanifest        # PWA manifest
├── sw.js                       # Service worker (offline cache, VERSION)
├── package.json                # Test scripts (dev dependencies only)
├── css/
│   └── estilos.css
├── js/
│   ├── main.js                 # Boot: models, repositories, login loop
│   ├── config.js · errors.js · models.js · validators.js · scheduler.js
│   ├── storage.js · auth.js · backup.js · pwa.js
│   ├── face-engine.js · model-loader.js · enrollment.js · attendance.js
│   ├── camera.js · voice.js · diagnostico.js
│   ├── excel.js · excel-import.js · excel-view.js · sheet-model.js
│   └── ui/
│       ├── dom.js · state.js · messagebox.js · widgets.js · branding.js
│       ├── login.js · main-window.js · save-prompt.js
│       ├── attendance-tab.js · courses-tab.js · settings-tab.js
│       └── dialogs.js
├── modelos/                    # YuNet + SFace (.onnx), add them manually
├── vendor/                     # onnxruntime-web and SheetJS (xlsx-js-style), local copies
├── icons/                      # PWA icons
└── tests/                      # Node tests (logic, UI with jsdom, PWA, sheet model)
```

---

## 🧪 Testing

Automated tests cover the domain logic, validators, scheduling, attendance book, sheet model (formulas, import, hiding), PWA files and the main screens (rendered with jsdom and a fake IndexedDB). They require **Node.js 20+**:

```bash
npm install
npm test
```

Manual check:
1. `diagnostico.html` → models load and a face is detected with score > 0.9.
2. Register yourself in a course and take attendance: you must be recognized and marked `1`.
3. Open *Ver Excel*, edit a cell, add a column with `=SUM(D2:E2)` and reload: the changes persist.
4. Import an `.xlsx`, check that students are sorted by surname and marked `⏳ Falta rostro`.
5. Download the `.xlsx` and edit it: the program's data must not change.
6. With the app already open, go offline in DevTools and reload: it must keep working.

---

## 🏗 Architecture and Design Notes

- **Static, framework-free:** ES modules loaded directly by the browser; a tiny `h()` helper builds the DOM.
- **Immutable-style updates:** domain functions return new frozen objects; the UI replaces state instead of mutating it.
- **Typed errors:** each layer raises a specific error that the UI turns into a friendly message.
- **Local-first:** IndexedDB is the single source of truth; the Excel is generated from it on demand.
- **Pure logic is separated from the UI** (`sheet-model.js`, `excel-import.js`, `scheduler.js`, `attendance.js`) so it can be tested in Node without a browser.
- **Offline by design:** `sw.js` pre-caches the code and tries to cache the heavy files (models, WASM) without blocking installation.
- **Safe formulas:** the sheet evaluator whitelists tokens instead of calling arbitrary JavaScript.
- **Cross-tab sync:** `BroadcastChannel` keeps the Excel tab and the main tab consistent.

---

## ⚠️ Known Limitations

This is an **educational project**, not a certified attendance or proctoring system.

- **No liveness / anti-spoofing:** a printed photo or a video of a student could be recognized. The blink-detection module of the desktop version was not ported.
- **Data is per browser and per domain:** nothing is shared between computers; use backups to move data.
- **Automatic lists need the tab open:** browsers throttle timers in hidden tabs.
- **No live Excel file on disk:** attendance is stored in the browser and the `.xlsx` is downloaded on demand.
- **Pending students count as absent** in lists until they complete their face registration.
- **Deleting a row in the Excel view** removes it only from the sheet; the student stays in the course. Renaming in the sheet does not rename the student in the course.
- **Percentage in downloaded files** covers the date columns that exist at download time.
- **Accuracy depends on lighting, camera quality and angle**; use the precision levels to tune it.
- **Voice** depends on the Spanish voices installed in the operating system.

---

## 🛠 Troubleshooting

| Problem | Solution |
|---------|----------|
| `"py" no se reconoce como un comando` | Use `python -m http.server 8000`, or install Python and tick **Add python.exe to PATH**. |
| The page does not load or the camera does not start | Open it through `http://localhost:8000` (or HTTPS), never as `file://`. |
| The camera asks for no permission / shows no cameras | Allow the camera from the padlock in the address bar and press **Buscar cámaras** in *Ajustes*. |
| *Error loading models* | Check that both `.onnx` files are in `modelos/` and that the large one is about 37 MB; if it is a few KB you downloaded an HTML page. |
| I changed the code but I still see the old version | Hard-reload (`Ctrl + Shift + R`), unregister the service worker in DevTools, or increase `VERSION` in `sw.js`. |
| A student is not recognized | Improve lighting, face the camera, or switch the precision to **Flexible** in *Ajustes*. |
| Two people are confused | Switch the precision to **Estricto** and register the students again with better samples. |
| The login page shows a saved-user card but I do not want it | Log in normally and untick *«Entrar con un clic»* in *Ajustes*. |
| My data disappeared | The browser's site data was cleared or you opened a different domain. Import your latest backup. |
| `npm test` never ends | Use the project script (`npm test`), which runs Node with `--test-force-exit`. |

---

## 👤 Author, Repository and License

- **Author:** Christopher Josué Villón Peralta
- **Repository:** <https://github.com/ChristopherVP/AsistenciaFacialWeb>
- **Third-party components:** [onnxruntime-web](https://github.com/microsoft/onnxruntime), [SheetJS `xlsx-js-style`](https://github.com/gitbrent/xlsx-js-style) (license in `vendor/LICENSE-xlsx-js-style.txt`) and the YuNet / SFace models from the [OpenCV Zoo](https://github.com/opencv/opencv_zoo) (check each project's license before redistributing).
- **License:** *not specified yet*: add a `LICENSE` file (e.g., MIT) if you want others to reuse the code.
