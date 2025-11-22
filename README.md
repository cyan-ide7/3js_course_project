# threejs-project

A small Three.js demo project with models and textures, using Parcel as a dev/build tool.

## Overview

This repository contains a basic Three.js scene scaffold. The project includes an HTML entry, a JavaScript script that initializes the scene, and folders for 3D models and textures.

## Project structure

- `src/`
  - `index.html` - app entry
  - `js/script.js` - main JavaScript for Three.js scene
  - `models/` - place 3D model files (glTF, OBJ, etc.) here
  - `textures/` - image textures used by models or materials

## Prerequisites

- Node.js (LTS recommended)
- npm (or yarn)

## Install

Open a terminal in the project root and run:

```powershell
npm install
```

## Development / Run locally

Start the Parcel dev server (the project already used `parcel` in earlier commands):

```powershell
npx parcel ./src/index.html
```

This will start a dev server and open the app in your browser with hot reload.

## Build for production

To build a production bundle using Parcel:

```powershell
npx parcel build ./src/index.html --dist-dir build
```

The bundled files will be in the `build/` directory.

