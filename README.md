# Document structure AI - Frontend

¡Bienvenido al repositorio del Frontend de **Document Structure AI**! Esta es una interfaz web intuitiva, moderna y responsive diseñada para la digitalización inteligente de documentos.

A través de esta aplicación, los usuarios pueden subir apuntes escaneados o presentaciones y visualizar cómo un potente motor de IA en el backend (DocLayout-YOLO + TrOCR) analiza la estructura visual para transformarla instantáneamente en un **HTML limpio, editable y fiel al diseño original**.

Ver aplicación en producción en **AI Studio**: [https://ai.studio/apps/77c0c55f-7fc3-46bf-9785-30a79e42240e](https://ai.studio/apps/77c0c55f-7fc3-46bf-9785-30a79e42240e)

---

## Características principales

* **Carga simple:** Sube imágenes o PDFs de tus apuntes con un solo arrastrar y soltar (Drag & Drop).
* **Detección estructural:** Previsualiza en tiempo real los bloques detectados por la IA (títulos, párrafos, listas, tablas).
* **Conversión a HTML:** Obtén un código estructurado que respeta rigurosamente las posiciones y la jerarquía del documento original.
* **Listo para editar:** Diseñado especialmente para estudiantes y profesionales que buscan digitalizar y editar material de estudio rápidamente.

---

## Tecnologías utilizadas

* **Frontend:** React / Next.js (o tu framework correspondiente)
* **Estilos:** Tailwind CSS (o tu herramienta de estilos)
* **Integración:** API del Microservicio FastAPI (DocLayout-YOLO + TrOCR) / Gemini API para refinamiento.

---

## Ejecución local

Sigue estos pasos para configurar y ejecutar el entorno de desarrollo en tu máquina local.

### Requisitos previos

Asegúrate de tener instalado:
* [Node.js](https://nodejs.org/) (Versión LTS recomendada)

### Pasos para la instalación

1.  **Clonar el repositorio e instalar dependencias:**
    ```bash
    npm install
    ```

2.  **Configurar las Variables de Entorno:**
    Crea o edita el archivo `.env.local` en la raíz del proyecto y añade tu clave de API:
    ```env
    GEMINI_API_KEY=tu_gemini_api_key_aqui
    ```

3.  **Iniciar el Servidor de Desarrollo:**
    ```bash
    npm run dev
