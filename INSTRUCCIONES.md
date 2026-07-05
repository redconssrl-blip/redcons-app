# Cómo instalar Redcons como app real

## Lo que necesitás (todo gratis)
- Una cuenta en Gmail (para Firebase y GitHub)
- 20 minutos de tu tiempo

---

## PASO 1 — Crear la base de datos en Firebase

1. Entrá a https://console.firebase.google.com
2. Hacé clic en **"Crear un proyecto"**
3. Nombre del proyecto: `redcons-app` → Continuar
4. Desactivá Google Analytics (no hace falta) → Continuar
5. Esperá que se cree el proyecto

### Configurar la base de datos:
1. En el menú de la izquierda, hacé clic en **"Firestore Database"**
2. Clic en **"Crear base de datos"**
3. Elegí **"Iniciar en modo de producción"** → Siguiente
4. Elegí la región más cercana (ej. `southamerica-east1`) → Habilitar
5. Una vez creada, hacé clic en la pestaña **"Reglas"**
6. Reemplazá el contenido con esto y hacé clic en **"Publicar"**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Obtener las credenciales:
1. En el menú de la izquierda, hacé clic en el ícono de ⚙️ (Configuración del proyecto)
2. Bajá hasta **"Tus apps"** → hacé clic en el ícono **`</>`** (Web)
3. Nombre de la app: `redcons-web` → Registrar app
4. Va a aparecer un bloque de código con tus credenciales. **Copiá los valores** de:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

---

## PASO 2 — Pegar las credenciales en el código

1. Abrí el archivo `src/firebase.js` con un editor de texto (Bloc de Notas, etc.)
2. Reemplazá cada `"TU_..."` con los valores que copiaste en el paso anterior
3. Guardá el archivo

---

## PASO 3 — Subir el código a GitHub

1. Entrá a https://github.com y creá una cuenta (si no tenés)
2. Hacé clic en **"New repository"**
3. Nombre: `redcons-app` → Público → **"Create repository"**
4. En la página del repositorio, hacé clic en **"uploading an existing file"**
5. Subí TODOS los archivos de esta carpeta (arrastrarlos o seleccionarlos)
   - ⚠️ Importante: subí la carpeta `src` completa con todos sus archivos adentro
6. Clic en **"Commit changes"**

---

## PASO 4 — Publicar en Vercel

1. Entrá a https://vercel.com y creá una cuenta (con tu cuenta de GitHub)
2. Hacé clic en **"Add New → Project"**
3. Buscá tu repositorio `redcons-app` y hacé clic en **"Import"**
4. En la configuración:
   - Framework Preset: **Vite**
   - Root Directory: dejalo vacío
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Hacé clic en **"Deploy"**
6. Esperá 2-3 minutos
7. Vercel te va a dar una URL como `redcons-app.vercel.app`

---

## PASO 5 — Instalar en el celular

1. Abrí la URL de Vercel en Chrome (Android) o Safari (iPhone)
2. Android: tocá los tres puntos (⋮) → **"Agregar a pantalla de inicio"**
3. iPhone: tocá compartir → **"Agregar a pantalla de inicio"**
4. Mandá esa URL a tus operarios para que hagan lo mismo

---

## ¡Listo!

Tu app ya está funcionando como una app real. Todos los datos se guardan en Firebase y son compartidos en tiempo real entre todos los celulares.

**Tu clave maestra de administrador:** `419930188`

Para cualquier problema, contactá al desarrollador.
