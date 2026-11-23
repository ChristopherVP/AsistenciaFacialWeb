# 📸 Asistencia Facial (Face Attendance PWA)

**A browser-based attendance system with on-device face recognition, written in plain HTML, CSS and JavaScript (ES modules). It manages courses and students, takes attendance with the camera (manually or automatically on a schedule), keeps one editable Excel-style sheet per course, imports and exports `.xlsx` files and works offline as an installable PWA. Everything runs in the browser: no server, no database, no framework, no build step.**

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES%20Modules-F7DF1E?logo=javascript&logoColor=black)
![ONNX](https://img.shields.io/badge/ONNX%20Runtime-Web-005CED?logo=onnx&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Offline%20ready-5A0FC8?logo=pwa&logoColor=white)
![Storage](https://img.shields.io/badge/Storage-IndexedDB-blue)
![Status](https://img.shields.io/badge/Status-Educational%20project-green)

Asistencia Facial is the web port of a desktop application (Python + Tkinter + OpenCV) and keeps its screens, texts and logic. Teachers create **courses**, register each student's face once and then take attendance by pointing the camera at the classroom: students are recognized on the device and marked present in an attendance book that behaves like an Excel sheet. Faces are detected with **YuNet** and recognized with **SFace**, both ONNX models executed in the browser by **onnxruntime-web** (WebAssembly), so no image ever leaves the computer.

The user interface is in **Spanish**. After the first visit the app works **without internet**: the models, the WebAssembly runtime and the spreadsheet library are all served from the project itself.

---

## Table of Contents

1. [Features at a Glance](#features-at-a-glance)
2. [Project Requirements](#project-requirements)
3. [Installation and Setup](#installation-and-setup)
4. [Running the Application](#running-the-application)
5. [Publishing (GitHub Pages / Netlify)](#publishing-github-pages--netlify)
6. [User Guide](#user-guide)
7. [Excel Tab](#excel-tab)
8. [Automatic Lists and Reminders](#automatic-lists-and-reminders)
9. [How Face Recognition Works](#how-face-recognition-works)
10. [Security and Privacy](#security-and-privacy)
11. [Validation Rules](#validation-rules)
12. [Domain Model and Modules](#domain-model-and-modules)
13. [Persistence and Browser Storage](#persistence-and-browser-storage)
14. [Offline Mode and Service Worker](#offline-mode-and-service-worker)
15. [Configuration Constants](#configuration-constants)
16. [Project Structure](#project-structure)
17. [Testing](#testing)
18. [Architecture and Design Notes](#architecture-and-design-notes)
19. [Known Limitations](#known-limitations)
20. [Troubleshooting](#troubleshooting)
21. [Author, Repository and License](#author-repository-and-license)

---

## Features at a Glance

**Accounts**
- Registration with full name, validated Ecuadorian *cédula*, username (with a live “available / already taken” check), password with confirmation and a **security question**.
- Login with username and password, show/hide password, **one-click login** for remembered users on a trusted computer, and **password recovery** through the security question.
- Temporary lock (30 s) after 5 failed attempts, for both login and recovery.

**Courses and students**
- Create, rename and delete **courses**; each course has its own students, schedule and attendance sheet.
- **Student registration with face scan**: guided capture of 5 frontal samples with an on-screen progress bar and **Spanish voice instructions** (Web Speech API), a mandatory consent checkbox and automatic **duplicate-face detection** against every student registered in any course under a different cédula.
- Students are always listed **alphabetically by surname (A–Z)**.
- **Pending students are left out of the attendance list:** students who have not finished their face registration do not appear in *Tomar lista*, are not counted and are not marked absent in the Excel until they finish.
- **Live countdown** in each schedule row (*Falta para empezar*: days, hours, minutes and seconds). It counts down to that schedule's next start, today if it is still ahead, so two schedules on the same day show their own minutes.
- **Completed schedules:** once an automatic list has been taken and saved, its schedule is marked **✔ Cumplido** with the date, can no longer be edited, switched or reused, and can only be removed.
- **Several schedules per course**, each one with its own **Activa / Apagada** button, plus **Activar todos**, **Desactivar todos** and **Modificar horario** (edit days and times of an existing schedule without deleting it).
- Students added from the Excel tab or imported from an Excel file stay **pending** (`⏳ Falta rostro`) until they finish their face scan with **✔ Terminar registro**.

**Attendance**
- **Live camera view**: faces are boxed and named, and a student is marked present only after several consecutive confirmations.
- Course picker with search-as-you-type and keyboard navigation, live counters (*Presentes* / *Sin registrar*), a per-student table with state and time, spoken and on-screen notices.
- **Manual lists** (with an elapsed-time counter) and **automatic lists** that start and stop by themselves inside the weekly time slots of each course.
- A list closes by itself when every enrolled student is present, warns by voice one minute before the class ends and asks for confirmation before leaving with a list in progress.
- If the list cannot be written to the sheet, the app offers to retry and, as a last resort, downloads a `.csv` with the marks.

**Excel tab (spreadsheet editor built into the app)**
- One file per course (`<course>_ListaAsistencia.xlsx`) listed like a folder, opened with a double click.
- Editor with **formula bar**, cell reference box, range / row / column selection, **undo / redo**, copy / cut / paste (also from and to real Excel), fill down, hide and show rows and columns, context menu and keyboard shortcuts.
- **Extra columns** (e.g. *Participación*) with formulas: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `MEDIAN`, `ROUND`, `ABS`, cell references, ranges and arithmetic.
- **Import another Excel** (`.xlsx` / `.xls`): students, dates and extra columns are merged, sorted by surname and by date.
- **Download a styled `.xlsx`** that keeps the `% Asistencia` formula; the downloaded file is a copy, so editing it never changes the program's data.

**Settings and appearance**
- Camera chooser with live preview and a clear “in use” badge; virtual cameras (OBS and similar) are ignored.
- **Light (day) and dark (night) themes**, switchable from a Day/Night button in the header. Message boxes and their button rows follow the theme too (no white patches in night mode).
- **Device permissions** card with the live status of the camera, a button to request it and a guide for **PC, Android and iPhone/iPad** on how to turn the camera on and give it permission (the ⋮ window menu does not exist on phones). The guide for your device opens automatically.
- **Scheduled-list reminder** card (choose 1, 2 or 3 minutes) and an **Install application** button that is always available while the app is not installed (in *Ajustes* and on the login screen): it installs with one tap when the browser allows it and otherwise shows the steps for PC, Android or iPhone/iPad.
- *My account* panel to enable or disable one-click login.

**Other**
- **Diagnostics page** (`diagnostico.html`) to check the models, the camera, the detection score and the similarity between two captures.
- **Installable PWA** (Android, iPhone/iPad and computers), usable offline, with tabs kept in sync through a `BroadcastChannel`. **The session stays open when the window is closed** (red ✕); only **Cerrar sesión** ends it.
- Automated tests for the domain logic, the sheet model, the reminders, the PWA files and the full UI flow.

---

## Project Requirements

### Functional requirements

| ID | Requirement |
|----|-------------|
| FR-01 | Register users with full name, valid cédula, username, password and security question; reject duplicated cédulas and usernames. |
| FR-02 | Authenticate users, allow logout, remember a user for one-click login and recover the password with the security question. |
| FR-03 | Create, rename and delete courses with unique (case-insensitive) names. |
| FR-04 | Register students with cédula, name and a guided face scan of 5 frontal samples; reject duplicated cédulas and faces already registered under another cédula in any course. |
| FR-05 | Recognize students through the camera and mark them present after consecutive confirmations. |
| FR-06 | Define weekly time slots per course (each one **at most 40 minutes long**), edit them, turn each one on or off individually (or all at once) and run **automatic attendance lists** inside the active ones, once per schedule per day. |
| FR-07 | Warn before a scheduled list while the app is open: the device vibrates (when it can) and a voice says the course will take attendance soon; 1 minute before by default, configurable to 2 or 3 in *Ajustes*. |
| FR-08 | Keep one attendance book per course with one column per list and a percentage column. |
| FR-09 | Show the book in an **Excel-style editor** with editable cells, extra columns, formulas, row and column insertion and deletion, undo / redo and clipboard support. |
| FR-10 | Hide rows and columns and restore them from a toolbar, a context menu or the keyboard. |
| FR-11 | Import another `.xlsx` keeping its students, dates and extra columns, ordered by surname and by date. |
| FR-12 | Mark students added or imported without a face as **pending** until their face registration is completed. |
| FR-13 | Download the attendance book as a styled `.xlsx`, independent from the stored data. |
| FR-14 | Choose and preview the camera, and ignore virtual cameras. |
| FR-15 | Offer a light (day) and a dark (night) theme. |
| FR-16 | Work offline and be installable as a PWA. |
| FR-17 | Let the user request and fix the camera permission from *Ajustes*, with separate instructions for PC, Android and iPhone/iPad. |

### Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | **No frameworks and no build step**: plain HTML, CSS and modern JavaScript (`const/let`, `async/await`, ES modules). |
| NFR-02 | **Privacy first**: all processing happens on the user's device; only face **embeddings** (not photos) are stored, locally. |
| NFR-03 | **Offline-ready**: a service worker caches the app, the ONNX models and the vendored libraries. |
| NFR-04 | **Accessible, responsive UI**: semantic HTML, ARIA roles on tabs, dialogs and live regions, keyboard navigation. |
| NFR-05 | **Explicit error handling**: typed errors (`ValidationError`, `StorageError`, `AttendanceError`, `AuthError`, `ModelError`, `CameraError`) and no silent failures. |
| NFR-06 | **Input safety**: every input is validated at the system boundary; passwords are never stored in clear text. |
| NFR-07 | **Immutable-style domain**: `createCourse`, `courseAddStudent`… return new frozen objects instead of mutating state. |
| NFR-08 | **Language**: the user interface and messages are in Spanish. |

### Software requirements

| Requirement | Details |
|-------------|---------|
| **Browser** | A recent **Chrome, Edge or Firefox** (WebAssembly, `getUserMedia`, IndexedDB and Service Workers). |
| **Context** | `https://` or `http://localhost` (camera, Web Crypto and service workers require a secure context). |
| **Camera** | Any webcam; frontal, well-lit faces work best. |
| **Models** | `face_detection_yunet_2023mar.onnx` (~230 KB) and `face_recognition_sface_2021dec.onnx` (~37 MB) inside `modelos/`. |
| **Local server** | Any static server, e.g. `python -m http.server 8000` (or `npm run servir`). |
| **Tests** *(optional)* | **Node.js 20+**. |

---

## Installation and Setup

```bash
git clone https://github.com/ChristopherVP/AsistenciaFacialWeb.git
cd AsistenciaFacialWeb
```

The two ONNX models must be in `modelos/`. They are the same ones the desktop version uses. If you download them again from the [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models), use **“Download raw file”**: “Save as” on the GitHub page saves an HTML file and the app will refuse to load it (it checks that each model is larger than 100 KB).

```text
modelos/
├── face_detection_yunet_2023mar.onnx
├── face_recognition_sface_2021dec.onnx
└── LEEME.txt
```

The onnxruntime-web runtime (`vendor/ort/`) and the spreadsheet library (`vendor/xlsx.bundle.js`) are already included, so no CDN is needed. `npm install` is only required to run the tests.

---

## Running the Application

The app must be served over `localhost` or HTTPS; opening `index.html` by double-click (`file://`) does **not** work.

```bash
# Windows
py -m http.server 8000
# or, if "py" is not recognized
python -m http.server 8000

# Linux / macOS
python3 -m http.server 8000

# Any OS with Node installed
npm run servir
```

1. Open `http://localhost:8000/diagnostico.html`, press **1. Cargar modelos** and **2. Probar con la cámara**. It should detect your face with a score above 0.9 and give a similarity above 0.40 between two captures of the same person. You can also press **3. Probar con una foto**.
2. Open `http://localhost:8000/` and create the first account with **«Regístrate aquí»**.
3. Stop the server with `Ctrl + C` when you finish.

> If you changed files and still see the old version, hard-reload with `Ctrl + Shift + R`, unregister the service worker in *DevTools → Application → Service Workers*, or increase `VERSION` in `sw.js`. Application code is served network-first, so a normal reload should already pick up changes while online.

---

## Publishing (GitHub Pages / Netlify)

The project is 100 % static, so publishing only means serving the folder over HTTPS. The `.nojekyll` file is already included so GitHub Pages serves every file as is.

**GitHub Pages**
1. Upload the **whole folder** (including `modelos/`, ~37 MB, which is allowed and `vendor/`).
2. *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
3. The link will be `https://YOUR_USER.github.io/AsistenciaFacialWeb/`.

**Netlify**
1. *Add new site → Deploy manually* and drag the folder, or connect the repository.
2. Leave the build command empty and publish the root directory.

After publishing:
- Every computer can open the link and **install** the app (install icon in the address bar, or *Ajustes → Instalar aplicación*) to use it offline.
- **Each browser and each domain keeps its own data** (IndexedDB). Data created on `localhost` does not appear on the published site.
- WebAssembly runs single-threaded (`numThreads = 1`) because GitHub Pages cannot send the cross-origin isolation headers that multi-threading requires.
- When you update the app, increase `VERSION` in `sw.js` so installed copies download the new files. The models and the WebAssembly runtime live in a separate cache (`asistencia-facial-pesados-v1`) that is **kept between versions**, so an update only downloads the small code files. The `_headers` file tells Netlify to let browsers keep `modelos/` and `vendor/ort/` for a year.
- **First visit size:** a new user downloads about 50 MB once (the SFace model ~37 MB and the WebAssembly runtime ~11 MB). Speed depends on that person's connection, not on how many people use the app; the number of *new* users only matters for the monthly transfer allowance of your hosting plan.

---

## User Guide

The main window has a header (logo, user name, **Día/Noche** theme button, **Cerrar sesión** and a live clock) and four tabs: **📷 Tomar lista**, **📚 Cursos**, **📊 Excel** and **⚙ Ajustes**. Tabs can be changed with the mouse or with the left / right arrow keys. Reloading the page keeps your session, the selected tab and the selected course.

1. **Register and log in.** The first account is created from «Regístrate aquí». After logging in, the app offers to remember you for one-click login (also available in *Ajustes → Mi cuenta*).
2. **Create a course.** *📚 Cursos → ➕ Nuevo curso*. Each course gets its own Excel file. Courses can be renamed (✏) or deleted (🗑); deleting a course also deletes its stored attendance.
3. **Register students.** Select the course and press **➕ Agregar estudiante**. Enter the cédula and the full name (surnames first, e.g. `PÉREZ GÓMEZ JUAN CARLOS`), tick the consent box, press **Iniciar escaneo facial** and look at the camera: the system captures 5 frontal samples and guides you by voice. **Quitar seleccionado** removes a student.
4. **Finish a pending registration.** Students shown as `⏳ Falta rostro` (added from the Excel tab or imported) are selected in the list and completed with **✔ Terminar registro**.
5. **Set a schedule** *(optional)*. In *⏰ Horario de lista automática* press **➕ Agregar horario**, pick the weekdays and the start and end times (a list lasts **at most 40 minutes**: the end time follows the start time and is capped automatically). Each row has its own **● Activa / ○ Apagada** button, so you can turn on a single schedule; **✔ Activar todos** and **○ Desactivar todos** change every schedule at once, and **✏ Modificar horario** edits the selected row (it keeps its on/off state). The course chip shows *SIN HORARIO*, *AUTOMÁTICA APAGADA* or *AUTOMÁTICA ACTIVA* (at least one schedule on).
6. **Take attendance.** *📷 Tomar lista*: type or pick the course, press start and let the camera recognize the students. Press **■ Finalizar y guardar** to close the list; absent students are saved as `0`. The list also closes by itself when everybody is present or, for automatic lists, when the time slot ends.
7. **View, edit or download the Excel.** In *📚 Cursos* press **👁 Ver Excel** (opens that course in the *📊 Excel* tab) or **⬇ Descargar**.
8. **Settings.** *⚙ Ajustes*: choose and test the camera, pick the theme, request or fix the **camera permission** (with guides for PC, Android and iPhone), choose the reminder minutes, install the app and manage one-click login.

---

## Excel Tab

The tab lists one file per course (`<course name>_ListaAsistencia.xlsx`) with its last list date, number of students and number of lists. Double-click a file (or select it and press **📂 Abrir** / `Enter`) to edit it inside the app; **⬇ Descargar .xlsx** downloads it without opening it. The sheet **saves every change** immediately and refreshes itself every 2 seconds while you are not editing, so lists taken in the *Tomar lista* tab appear automatically.

### Sheet layout

| Column | Content |
|--------|---------|
| **A – Cédula** | Student id (not editable). |
| **B – Apellidos y nombres** | Student name (editable, stored in upper case). |
| **C – % Asistencia** | Computed: `SUM / COUNT` of the cells that have data. |
| **D…** | One column per list (date and time): `1` present, `0` absent, empty = no data. |
| **After the dates** | **Extra columns** you create (text, numbers or formulas). |

The editor always shows empty columns and at least 30 rows so you can keep typing, like in a real spreadsheet.

### Editing

| Action | How |
|--------|-----|
| **Edit a cell** | Select it and just type, or press `F2` / double-click. `Enter` / `Tab` confirm and move, `Esc` cancels. |
| **Attendance cells** | Accept only `0`, `1` or empty. |
| **Add an extra column** | **➕ Columna**, then write its title in the header cell (row 1). |
| **Add a student** | Type a valid cédula and a name in the first empty row (or use **➕ Fila (estudiante)**). The student is added to the sheet and to the course as *pending face registration*. |
| **Delete rows / columns** | **🗑 Eliminar filas / columnas**, the context menu or `Ctrl + -`. The three fixed columns cannot be deleted. Deleting a row removes it only from the Excel, not from the course. |
| **Hide / show** | **🙈 Ocultar columnas / filas**, `Ctrl + 0` / `Ctrl + 9`, or the context menu. **👁 Mostrar todo** restores everything. |
| **Select** | Click, drag, click a column letter, a row number or the top-left corner. Hold `Shift` with the arrows to extend. |
| **Clipboard** | `Ctrl + C`, `Ctrl + X` and `Ctrl + V` work with tab-separated text, so you can copy to and from Excel. |
| **Undo / redo** | **↶ Deshacer** / **↷ Rehacer**, `Ctrl + Z` and `Ctrl + Y` (or `Ctrl + Shift + Z`). |
| **Clear contents** | `Delete` or `Backspace`. |
| **Back** | **← Volver** returns to the file list. |

### Keyboard shortcuts

| Keys | Action |
|------|--------|
| Arrows | Move the active cell (`Ctrl` + arrow jumps to the edge). |
| `Tab` / `Shift + Tab` | Move right / left. |
| `Enter` / `Shift + Enter` | Move down / up. |
| `Home` / `End` | First / last column. |
| `Ctrl + Home` | Go to the first cell. |
| `Ctrl + A` | Select everything. |
| `Ctrl + D` | Fill down. |
| `Ctrl + S` | Download the `.xlsx`. |
| `Ctrl + 9` / `Ctrl + 0` | Hide the selected rows / columns. |
| `Ctrl + -` | Delete the selected rows or columns. |

### Formulas

Write a formula in an extra column, for example `=SUM(D2:F2)`, `=AVERAGE(D2:D40)`, `=ROUND(D2/3,1)` or `=D2+E2*2`.

- Functions: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `MEDIAN`, `ROUND`, `ABS`.
- References (`D2`) and ranges (`D2:F40`); column C can be referenced and returns the attendance as a 0–1 value.
- Results are rounded to 2 decimals. Invalid expressions show `#ERROR` and circular references show `#CIRCULAR`.
- Only digits, operators, parentheses, commas and the functions above are accepted, so typed formulas cannot run arbitrary code.
- Formulas are exported as real Excel formulas.

### Importing an Excel file

**⬆ Importar** reads the first sheet of an `.xlsx` or `.xls` file:

- It looks for the header row that contains *Cédula* and for the *Apellidos y nombres* column (or separate *Apellidos* / *Nombres* columns).
- Columns whose header is a date (an Excel date or text like `25/11/2026 08:00`) become attendance columns with their `0` / `1` marks.
- Any other column becomes an extra column; the `% Asistencia` column is ignored because it is recomputed.
- A 9-digit cédula gets its lost leading zero back. Rows with an invalid cédula or without a name are skipped and reported before you confirm.
- The import is merged with the existing sheet (existing values win), sorted by surname and by date, and students that were not in the course are added as **pending face registration**.

### Downloaded file

The `.xlsx` is built with a local copy of SheetJS (`xlsx-js-style`): blue bold headers, centered marks, dates formatted as `DD/MM/YYYY HH:MM`, column widths, and a `% Asistencia` formula (`IF(COUNT(...)=0,"",SUM(...)/COUNT(...))`) in each row.

---

## Automatic Lists and Reminders

**Automatic lists** (*Cursos → Horario de lista automática*)
- Each course can have several weekly slots (weekdays, start, end), each lasting **at most 40 minutes** and each with its own on/off switch: only the **active** slots start lists and send reminders. A slot added to a course whose automatic list is off starts off, and one added to a course that already has active slots starts on. With the schedule turned on, the list starts by itself the first time the app sees the current time inside a slot, **once per day** per course.
- Only students with a completed face registration take part. If none has one, the list is skipped with a notice.
- The camera opens, the window is focused, a voice announces the list and a countdown shows the time left. One minute before the slot ends a voice warns the class, and the list is saved when the slot ends.
- The app (or its installed window) must be **open and signed in**: browsers throttle or suspend timers in closed or hidden tabs.

**Reminders** (`reminders.js`)
- **1 minute before** (default; 1, 2 or 3 can be chosen in *Ajustes → Aviso de lista programada*) the device **vibrates** (Android and other browsers that support it) and a **voice** says «Pronto se tomará lista al curso …». When the list starts, the voice says again that the course list is about to start.
- **Completed schedules never remind or start again:** a schedule marked *Cumplido* is ignored by the scheduler and the reminders.
- **Why there are no system notifications:** a web page that is closed cannot notify, vibrate or take attendance (that would need a push server). The reminders therefore only work while the app is open.
- **No sudden alerts:** each reminder is only given if the app had already seen the schedule *before* that reminder's window began. A schedule created, turned on or opened inside the window does not fire the notification at once; only the reminder that can still arrive on time is given (for example, a schedule created 3 minutes ahead gets only the voice, at 1 minute before).
- A minimized or hidden window may run its clock more slowly (browser power saving), so a reminder can arrive up to about a minute late.
- Each schedule starts its list at most once per day: a list taken in one schedule does not block the other schedules of the same course on that day. Each reminder is given once per day, even with several windows open.

---

## How Face Recognition Works

| Stage | Detail |
|-------|--------|
| **Detection** | **YuNet** (ONNX) finds faces in each frame; faces below a score of 0.85 are ignored (NMS threshold 0.3). Frames are padded to a multiple of 32, with a 640×640 fallback for models with a fixed input size. |
| **Alignment** | The five facial landmarks are mapped to the standard template with a similarity transform and cropped to 112×112. |
| **Embedding** | **SFace** (ONNX) turns the aligned face into a 128-value vector (*embedding*). |
| **Matching** | Cosine similarity between the live embedding and every stored sample; each student keeps their best sample, and the runner-up must be at least `margin` behind to avoid ambiguous matches. |
| **Confirmation** | A student is marked present only after N **consecutive** frames; seeing them again later shows an “already registered” notice. |
| **Registration** | 5 samples taken every 0.6 s, only from **frontal** faces with score ≥ 0.9 (limited yaw and roll), with a 60 s timeout and spoken reminders every 8 s. |
| **Duplicate check** | The new student's samples are compared with every student of every course (except the same cédula); a face already registered under another cédula is rejected. |

Frames are processed on the device in WebAssembly, one of every two frames (~30 fps video, 640×480 view), so no image or video is ever uploaded.

### Precision levels

`config.js` defines three levels. The application currently runs on **Equilibrado**; to change it, set `DEFAULT_SETTINGS.threshold` in `js/models.js` to the level's threshold (the nearest level is used).

| Level | Threshold | Margin | Frames | Use it when |
|-------|-----------|--------|--------|-------------|
| **Flexible** | 0.33 | 0.00 | 2 | students are not being recognized |
| **Equilibrado** *(default)* | 0.40 | 0.05 | 3 | most cases |
| **Estricto** | 0.50 | 0.10 | 5 | people are being confused with each other |

---

## Security and Privacy

| Area | Implementation |
|------|----------------|
| **Passwords** | Never stored in clear text: **PBKDF2-WithHmac-SHA256**, 200,000 iterations, random 16-byte salt (Web Crypto API), constant-time comparison. |
| **Security answers** | Normalized (case and accents ignored) and hashed with the same scheme. |
| **Brute force** | 5 failed logins (or recovery answers) lock that user for 30 s (in memory). |
| **Biometric data** | Only **face embeddings** are stored (numeric vectors), never photos or video. They never leave the browser. |
| **Consent** | Registering a face requires accepting a consent notice. |
| **Local data** | All data lives in the browser's IndexedDB; whoever has access to that browser profile has access to the data. |
| **Closing the window** | The red ✕ closes the app directly, without any confirmation. At that moment the app finishes what is pending: a running list is finished and saved and a half-edited sheet cell is committed (everything else is already saved). **Cerrar sesión** keeps its own confirmation dialog. |
| **Excel formulas** | The evaluator checks the expression against a whitelist of characters and functions before evaluating it. |
| **No secrets in code** | There are no keys, tokens or passwords in the source; there is no backend. |

> Face embeddings are biometric personal data. Use the app with the informed consent of the people involved and follow your institution's data-protection rules.

---

## Validation Rules

| Field | Rule |
|-------|------|
| **Cédula** | Numeric only, valid province code (01–24), third digit ≤ 5 and valid check digit; unique per course. The screens just say «Cédula». |
| **Names** | Letters (including accents and ñ) and spaces, at least two words, up to 60 characters; stored in upper case. |
| **Username** | 4–20 characters, lowercase letters, digits, `.` and `_`, starting with a letter; unique. |
| **Password** | 8–64 characters; must match its confirmation. |
| **Security question / answer** | One question from the list; answer of at least 3 characters. |
| **Course name** | Not empty, up to 60 characters, unique (case-insensitive). |
| **Schedule slot** | Stored with an `enabled` flag (on/off); at least one weekday; end time later than start time (`HH:MM`); **at most 40 minutes** long. Courses saved earlier with longer slots are still read correctly. |
| **Attendance cell** | `0`, `1` or empty. |
| **Imported file** | Needs a *Cédula* column and a name column; rows with an invalid cédula or without a name are skipped and reported. |
| **Face registration** | Frontal faces only, score ≥ 0.9, 5 samples, 60 s limit, no duplicate face. |
| **Recognition threshold** | Limited to the range 0.30–0.80. |

---

## Domain Model and Modules

| Module | Responsibility |
|--------|----------------|
| `config.js` | Constants: models, thresholds, precision levels, validation limits, security questions, colors, database name. |
| `models.js` | Immutable domain: `createStudent`, `createCourse`, `createSlot` (with its `enabled` flag), schedule helpers (`courseAddSlot`, `courseReplaceSlot`, `courseToggleSlot`, `courseSetAllSlots`, `courseRemoveSlot`), `DEFAULT_SETTINGS` and `courseFromDict` (also reads desktop-version JSON and courses saved before per-slot switches). |
| `validators.js` / `errors.js` | Input validation (cédula, names, username, password, answers) and typed errors. |
| `auth.js` | `UserRepository` and `LoginThrottle`: PBKDF2 hashing, login throttling, remembered users, password recovery. |
| `storage.js` | IndexedDB wrapper and repositories: `CourseRepository`, `BookRepository`, `SettingsRepository`, plus `excelFileName`. |
| `face-engine.js` | YuNet + SFace inference with onnxruntime-web, alignment, embeddings and `Gallery` matching. |
| `model-loader.js` | Loads onnxruntime-web and the ONNX models with progress reporting and integrity checks. |
| `enrollment.js` | `FaceEnrollment`: guided capture of frontal samples with timeouts and spoken prompts. |
| `attendance.js` | `AttendanceSession` (consecutive-frame confirmation) and `AttendanceBook` (columns and marks per course). |
| `scheduler.js` | Weekly slots: active slot, due courses and the next automatic list. |
| `sheet-model.js` | Pure logic of the editable sheet: cells, extra columns, formulas, hiding, sorting and import merge. |
| `excel.js` / `excel-import.js` | Styled `.xlsx` export and `.xlsx` import (SheetJS, loaded on demand). |
| `camera.js` / `voice.js` | Camera enumeration, opening and drawing; Spanish speech synthesis that prefers a female voice. |
| `theme.js` | Light / dark theme, stored in the browser and synchronized between windows. |
| `permissions.js` | Device detection (PC, Android, iPhone/iPad) and the step-by-step texts for the camera permission and for installing the app. |
| `backup.js` | `downloadBlob` (used by every download) and the JSON backup export / import functions (see [Known Limitations](#known-limitations)). |
| `pwa.js` | Service worker registration, the install prompt and the request that stores the heavy files for offline use. |
| `ui/install-help.js` | The **Instalar aplicación** action: native install prompt when available, otherwise the steps for the device. |
| `diagnostico.js` | Logic of the diagnostics page. |
| `ui/` | `main-window`, `login`, tabs (`attendance-tab`, `courses-tab`, `excel-tab`, `settings-tab`), `dialogs`, `reminders`, `save-prompt`, `messagebox`, `widgets`, `branding`, `state` and a tiny `h()` DOM helper (`dom.js`). |

### How attendance is stored

Each course has one *book*:

```jsonc
{
  "course_id": "programacion-a1b2c3",
  "sheet_title": "Programación",
  "rows":    [{ "id": "1710034065", "name": "PÉREZ GÓMEZ JUAN" }],
  "columns": [{ "moment": 1763712000000, "marks": { "1710034065": 1 } }],
  "extras":  [{ "title": "Participación", "cells": { "1710034065": "=SUM(D2:E2)" } }],
  "hidden":  { "cols": [], "rows": [] }
}
```

`rows` are the students, `columns` are the lists (one per date and time, in order) and `extras` are the custom columns. The percentage is computed as `SUM / COUNT` of the cells that have data, the same formula the exported `.xlsx` contains.

---

## Persistence and Browser Storage

**IndexedDB** (database `AsistenciaFacial`, version 1)

| Store | Key | Content |
|-------|-----|---------|
| `courses` | `course_id` | Courses with students (cédula, name, face embeddings), slots and automatic-list state. |
| `books` | `course_id` | Attendance book per course (rows, columns, extra columns, hidden rows and columns). |
| `settings` | `key` | Camera and recognition settings. |
| `users` | `cedula` | Accounts with salted PBKDF2 hashes and the remembered flag. |

**Other browser storage**

| Where | Key | Purpose |
|-------|-----|---------|
| `localStorage` | `af_theme` | Chosen theme (light or dark). |
| `localStorage` | `af_reminders` | Reminders already sent today (shared between windows). |
| `localStorage` | `af_reminder_lead` | Chosen minutes (1, 2 or 3) for the voice and vibration reminder. |
| `localStorage` | `af_user`, `af_tab`, `af_course` | Keep the open session, the tab and the course between visits, even after closing the window; removed by **Cerrar sesión**. On a shared computer always use **Cerrar sesión**. |

Other details:
- The browser is asked for **persistent storage** so it does not discard the data when disk space is low.
- **Saving on exit:** when the window is closed (the ✕ button) or reloaded, the app finishes what is pending the same way *Cerrar sesión* does: a running list is finished and saved, and a half-edited sheet cell is committed. Browsers do not guarantee that asynchronous work completes while a page unloads, so if a list is running and you want to be certain, choose *Cancelar* in the confirmation and use *Finalizar y guardar*.
- Tabs and windows of the app stay in sync through a `BroadcastChannel` (`af-courses`) and an internal subscription mechanism: changes made in the Excel tab appear immediately in *Cursos*, and lists taken appear in the sheet.
- **Deleting a course also deletes its stored attendance**: download the Excel first if you need it.

> Clearing the browser's site data erases everything. Download the Excel files you care about regularly.

---

## Offline Mode and Service Worker

`sw.js` (code cache `asistencia-facial-v13`, heavy-files cache `asistencia-facial-pesados-v1`):

- **Install:** pre-caches only the small application shell (HTML, CSS, every JS module, icons and manifest), so installing and updating are quick. The heavy files (the two ONNX models, the onnxruntime-web files and `xlsx.bundle.js`) are stored in their own cache once the app has loaded them (the page asks the worker with a `WARM_HEAVY` message, which reuses the browser's own copy instead of downloading again), and older caches' copies are adopted when the worker updates.
- **Application code:** *network-first* (`cache: "no-cache"`), so you always get the latest version when online and the cached copy when offline.
- **Models, WebAssembly, `vendor/` and icons:** *cache-first*.
- **Navigation offline:** falls back to the cached `index.html`.
- **Activation:** old caches are deleted and the new worker takes control immediately.

Whenever you add a JS module, add it to the `CORE` list in `sw.js` (a test checks this) and increase `VERSION` when you publish.

---

## Configuration Constants

Defined in `js/config.js`:

| Constant | Value | Meaning |
|----------|-------|---------|
| `DETECTOR_SCORE_THRESHOLD` | 0.85 | Minimum detection score. |
| `DETECTOR_NMS_THRESHOLD` / `DETECTOR_TOP_K` | 0.3 / 5000 | Non-maximum suppression. |
| `PROCESS_EVERY_N_FRAMES` / `FRAME_DELAY_MS` | 2 / 33 | Recognition cadence. |
| `MAX_READ_FAILURES` | 90 | Failed camera reads before the list is saved and closed. |
| `VIEW_WIDTH` × `VIEW_HEIGHT` | 640 × 480 | Camera view size. |
| `MIN_THRESHOLD` / `MAX_THRESHOLD` | 0.30 / 0.80 | Allowed recognition threshold range. |
| `SAMPLE_INTERVAL` / `MAX_SAMPLES` | 0.6 s / 5 | Face enrollment samples. |
| `MIN_FACE_SCORE` | 0.9 | Minimum score for an enrollment sample. |
| `SCAN_TIMEOUT_SECONDS` / `REMIND_SECONDS` | 60 / 8 | Enrollment time limit and spoken reminder interval. |
| `MAX_YAW_RATIO` / `MAX_ROLL_RATIO` | 0.25 / 0.30 | How frontal a face must be. |
| `PBKDF2_ITERATIONS` | 200,000 | Password hashing cost. |
| `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_SECONDS` | 5 / 30 | Brute-force protection. |
| `NOTICE_MS` | 4000 | Duration of on-screen notices. |
| `MAX_SLOT_MINUTES` | 40 | Longest allowed duration of a scheduled list. |
| `EXCEL_SUFFIX` | `_ListaAsistencia.xlsx` | File name suffix of each course's Excel. |

---

## Project Structure

```text
AsistenciaFacialWeb/
├── index.html                  # Main app (splash + login + tabs)
├── diagnostico.html            # Models / camera / similarity diagnostics
├── manifest.webmanifest        # PWA manifest
├── sw.js                       # Service worker (offline cache, VERSION)
├── package.json                # Test and local-server scripts (dev dependencies only)
├── .nojekyll                   # GitHub Pages: serve files as they are
├── _headers                    # Netlify: browsers keep the models and the runtime for a year
├── css/
│   └── estilos.css             # Styles, light and dark themes
├── js/
│   ├── main.js                 # Boot: theme, models, repositories, login loop
│   ├── config.js · errors.js · models.js · validators.js · scheduler.js
│   ├── storage.js · auth.js · backup.js · pwa.js · theme.js · permissions.js
│   ├── face-engine.js · model-loader.js · enrollment.js · attendance.js
│   ├── camera.js · voice.js · diagnostico.js
│   ├── excel.js · excel-import.js · sheet-model.js
│   └── ui/
│       ├── dom.js · state.js · messagebox.js · widgets.js · branding.js
│       ├── login.js · main-window.js · save-prompt.js · reminders.js
│       ├── attendance-tab.js · courses-tab.js · excel-tab.js · settings-tab.js
│       └── dialogs.js
├── modelos/                    # YuNet + SFace (.onnx) and LEEME.txt
├── vendor/
│   ├── ort/                    # onnxruntime-web (.mjs + .wasm), local copy
│   ├── xlsx.bundle.js          # SheetJS (xlsx-js-style), local copy
│   └── LICENSE-xlsx-js-style.txt
├── icons/                      # PWA icons (SVG, 192, 512, maskable)
└── tests/                      # Node tests (logic, UI with jsdom, PWA, sheet model…)
```

---

## Testing

Automated tests use the built-in Node.js test runner with `jsdom` and `fake-indexeddb`. They require **Node.js 20+**:

```bash
npm install
npm test
```

`npm test` runs `node --test --test-force-exit tests/*.test.js`. The suites cover:

| File | Covers |
|------|--------|
| `logica.test.js` | Cédula, names and usernames, schedules, scheduler, `Gallery` matching, attendance session and book, face enrollment, users and login throttling (real PBKDF2), courses, voice selection, virtual cameras. |
| `sheet-model.test.js` | Import merge, formulas and percentages, hiding and mark validation. |
| `excel-tab.test.js` | The Excel tab: files per course, opening a sheet, multiple selection, hiding and deleting. |
| `reminders.test.js` | Vibration and voice at the chosen minutes (1 by default), no sudden alerts for schedules created inside the window, duplicate, on/off and completed rules. |
| `pwa.test.js` | Service worker file list, every JS module cached, installable manifest. |
| `instalacion.test.js` | Fast service-worker install with a separate heavy-files cache, Netlify cache headers, iPhone/Android install tags and steps, the always-available install button and the persistent session. |
| `theme.test.js` | Light / dark theme persistence. |
| `permisos-horario.test.js` | Device detection and permission texts, the 40-minute slot limit (and legacy courses) and the schedule dialog. |
| `horarios.test.js` | Per-slot on/off, activate / deactivate all, editing a slot, completed (locked) schedules, reading courses saved before per-slot switches and the edit dialog. |
| `ui.test.js` | Full interface flow: account → courses → schedule → attendance list → Excel. |

Manual check:
1. `diagnostico.html` → models load and a face is detected with score > 0.9.
2. Register yourself in a course and take attendance: you must be recognized and marked `1`.
3. Open the *Excel* tab, edit a cell, add a column with `=SUM(D2:E2)` and reload: the changes persist.
4. Import an `.xlsx`, check that students are sorted by surname and marked `⏳ Falta rostro` in *Cursos*.
5. Download the `.xlsx` and edit it: the program's data must not change.
6. Set a slot about 10 minutes ahead and turn on the automatic list (or choose 2 minutes in *Ajustes* and use a slot 4 minutes ahead): the device must vibrate and the voice must speak at the chosen minute, and the list must start by itself.
7. With the app already open, go offline in DevTools and reload: it must keep working.

---

## Architecture and Design Notes

- **Static, framework-free:** ES modules loaded directly by the browser; a tiny `h()` helper builds the DOM.
- **Immutable-style updates:** domain functions return new frozen objects; the UI replaces state instead of mutating it.
- **Typed errors:** each layer raises a specific error that the UI turns into a friendly message.
- **Local-first:** IndexedDB is the single source of truth; the `.xlsx` is generated from it on demand.
- **Pure logic separated from the UI** (`sheet-model.js`, `excel-import.js`, `scheduler.js`, `attendance.js`, `validators.js`) so it can be tested in Node without a browser.
- **Offline by design:** `sw.js` pre-caches the code and keeps the heavy files (models, WASM) in a separate cache that survives updates, without blocking installation.
- **Safe formulas:** the sheet evaluator whitelists tokens before evaluating an expression.
- **Live sync:** an `AppState` subscription and a `BroadcastChannel` keep tabs and windows consistent.
- **Lazy loading:** SheetJS is only loaded the first time an Excel file is imported, edited or downloaded.
- **Resilient saving:** a list is written to the sheet as each student is recognized, so a crash loses almost nothing; failures offer retry and a `.csv` fallback.

---

## Known Limitations

This is an **educational project**, not a certified attendance or proctoring system.

- **No liveness / anti-spoofing:** a printed photo or a video of a student could be recognized. The blink-detection module of the desktop version was not ported.
- **Data is per browser and per domain:** nothing is shared between computers. The Excel files can be downloaded and imported elsewhere, but face registrations are not transferred.
- **Backups are not wired to the interface yet:** `backup.js` already contains `exportBackup` and `importBackup` (full JSON backup, also reading the desktop version's `curso.json` and `usuarios.json`), but there are no buttons for them in *Ajustes* in the current version.
- **Precision level is fixed:** the *Flexible / Equilibrado / Estricto* levels exist in the code but the interface runs on *Equilibrado*.
- **Automatic lists need the app open and signed in:** browsers throttle timers in hidden tabs and a web page cannot wake itself up.
- **No live Excel file on disk:** attendance is stored in the browser and the `.xlsx` is downloaded on demand.
- **Pending students are not part of the list** until they complete their face registration: they do not appear in *Tomar lista* and are left blank (not absent) in the Excel.
- **Deleting a row in the Excel tab** removes it only from the sheet; the student stays in the course. Renaming a student in the sheet does not rename them in the course.
- **Formulas are a safe subset** of Excel (the functions listed above), not the full language.
- **Accuracy depends on lighting, camera quality and angle.**
- **Voice** depends on the Spanish voices installed in the operating system.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| I cannot install the app on iPhone or Android | Use **📲 Instalar aplicación** on the login screen or in *Ajustes*: when the browser does not allow one-tap install it shows the steps. iPhone/iPad: Safari (or another browser, iOS 16.4+) → Share → *Agregar a pantalla de inicio*. Android: open the page in Chrome itself (not inside WhatsApp or another app) → ⋮ → *Instalar aplicación*. |
| The first visit is slow | The first visit downloads about 50 MB once (models and runtime). Updates no longer download them again. Use a good connection for the first load; afterwards the app opens from the device. |
| `"py" no se reconoce como un comando` | Use `python -m http.server 8000`, `npm run servir`, or install Python and tick **Add python.exe to PATH**. |
| The page does not load or the camera does not start | Open it through `http://localhost:8000` (or HTTPS), never as `file://`. |
| The camera asks for no permission / shows no cameras | Open *Ajustes → Permisos del dispositivo*, press **📷 Permitir cámara** and, if it is blocked, follow the steps for your device (PC, Android or iPhone). Then press **🔄 Buscar cámaras**. |
| On the phone there is no ⋮ menu to give permissions | Use *Ajustes → Permisos del dispositivo*: it requests the permissions directly and explains how to unblock them from the phone's own settings. |
| *Error loading models* / “modelo incompleto” | Check that both `.onnx` files are in `modelos/` and that the large one is about 37 MB; if it is a few KB you downloaded an HTML page or a Git LFS pointer. Press **Reintentar**. |
| I changed the code but I still see the old version | Hard-reload (`Ctrl + Shift + R`), unregister the service worker in DevTools, or increase `VERSION` in `sw.js`. |
| A student is not recognized | Improve lighting, face the camera, or raise the tolerance (see [Precision levels](#precision-levels)). Re-registering the student with better samples also helps. |
| Two people are confused | Use the *Estricto* level and register the students again with better samples. |
| The automatic list did not start | The app must be open and signed in, the course must have the schedule turned on, at least one student with a completed face registration, and the list for that day must not have been taken already. |
| The login page shows a saved-user card but I do not want it | Log in normally and untick *«Entrar con un clic»* in *Ajustes → Mi cuenta*. |
| My data disappeared | The browser's site data was cleared or you opened a different domain (`localhost` and the published site do not share data). |
| `npm test` never ends | Use the project script (`npm test`), which runs Node with `--test-force-exit`. |

---

## Author, Repository and License

- **Author:** Christopher Josué Villón Peralta
- **Repository:** <https://github.com/ChristopherVP/AsistenciaFacialWeb>
- **Third-party components:** [onnxruntime-web](https://github.com/microsoft/onnxruntime), [SheetJS `xlsx-js-style`](https://github.com/gitbrent/xlsx-js-style) (license in `vendor/LICENSE-xlsx-js-style.txt`) and the YuNet / SFace models from the [OpenCV Zoo](https://github.com/opencv/opencv_zoo) (check each project's license before redistributing).
- **License:** *not specified yet*: add a `LICENSE` file (e.g., MIT) if you want others to reuse the code.
