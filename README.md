# 📊 Querylytics: AI-Powered Private Data Analyst

<p align="center">
  <img src="assets/Screenshot (15).png" width="48%" alt="Querylytics Gallery View">
  <img src="assets/Screenshot (16).png" width="48%" alt="Querylytics Gallery View">
  <img src="assets/Screenshot (17).png" width="48%" alt="Querylytics Gallery View">
  <img src="assets/Screenshot (18).png" width="48%" alt="Querylytics Gallery View">
  <img src="assets/Screenshot (19).png" width="48%" alt="Querylytics Gallery View">
  <img src="assets/Screenshot (20).png" width="48%" alt="Querylytics Gallery View">
  <img src="assets/Screenshot (21).png" width="48%" alt="Querylytics Gallery View">
  <img src="assets/Screenshot (22).png" width="48%" alt="Querylytics Gallery View">
</p>
<p align="center">
  <em>Upload datasets, ask questions in plain English, and instantly generate interactive insights.</em>
</p>

## 🌟 Project Summary
Querylytics is a highly secure, AI-driven data analysis platform built with a strict **3-Tier Architecture**. It allows users to upload raw datasets (CSV/Excel) and interact with them using natural language. Instead of sending sensitive data rows to an LLM, the system securely passes only the dataset schema to a Large Language Model (Google Gemini). The LLM acts as an autonomous data scientist, generating raw Python code (Pandas & Plotly) which is then executed safely on the local backend. The resulting insights and interactive WebGL charts are seamlessly streamed back to the React frontend.

**Tech Stack:**
* **Frontend:** React (Vite), Tailwind CSS, Plotly.js, Lucide Icons, Axios.
* **Backend:** FastAPI, Python (Pandas, Plotly), SQLite (SQLAlchemy), Uvicorn.
* **AI & Vector Search:** Google Gemini 3 Flash, LangChain, ChromaDB.

## 🔄 App Workflow & Architecture
1.  **Secure Proxy:** The user accesses the React frontend (Port 5173). All backend calls are masked through a Vite Proxy (`/api`), ensuring the FastAPI backend (Port 8000) remains completely hidden from direct browser access.
2.  **Authentication:** Every request must pass a custom `X-API-KEY` gatekeeper in the FastAPI backend, reinforcing the 3-tier security model.
3.  **Data Ingestion & Vectorization:** When a user uploads a dataset, the backend parses it using Pandas and extracts the schema. 
4.  **AI Code Generation:** When a user asks a question, the LLM analyzes the query against the schema and writes native Python code to aggregate data and generate Plotly charts.
5.  **Safe Execution & Rendering:** The Python code is executed in an isolated async thread. The backend serializes the Plotly figure into optimized JSON (`fig.to_dict()`) and sends it to the frontend, where it is rendered interactively using WebGL.

## 🧠 Why We Use a VectorDB (ChromaDB)
In enterprise data environments, datasets often have hundreds of columns. Passing a massive schema to an LLM for every single query exhausts context windows, wastes tokens, and causes AI hallucinations. 

To solve this, we integrated **ChromaDB**. When a dataset is uploaded, its schema and statistical summaries are embedded into the Vector Database. When a user asks a question (e.g., *"Show me sales in New York"*), the system performs a similarity search in ChromaDB to retrieve **only the relevant column definitions** needed for that specific question. This allows the app to handle infinitely large datasets with near-zero latency and laser-focused LLM accuracy.

---

## 🚀 Getting Started

### 1. Create the Project Structure (PowerShell)
If you are starting from scratch or want to rebuild the folder structure, open PowerShell and run these commands to scaffold the project:

```powershell
# Create root directory
mkdir Querylytics
cd Querylytics

# Create Frontend and Backend folders
mkdir frontend, backend
```

### 2.Setting Up Backend
Navigate to the backend directory and set up your Python environment:

```
cd backend
mkdir app, data, vectors
New-Item main.py, requirements.txt, .env -ItemType File
New-Item app/__init__.py, app/utils.py -ItemType File

python -m venv venv
.\venv\Scripts\activate  # On Mac/Linux use: source venv/bin/activate
pip install requirements.txt
```

### 3, Setting up Your Environment Variables (.env)
You need an API key from Google AI Studio (Gemini) or OpenAI.
1. Get your free API key from Google AI Studio.
2. Open the backend/.env file and add the following:

```
GOOGLE_API_KEY="your_gemini_api_key_here"
```

### 4. Frontend Setup
U can open new terminal from the root directory or in same terminal run following commands

```
cd ..
cd frontend
npm create vite@latest . -- --template react
npm install
npm install axios lucide-react react-markdown remark-gfm plotly.js-dist react-plotly.js @tailwindcss/vite
```

### 5. Running the Application.
You will need two terminal windows running simultaneously.

Terminal 1 (Backend):
```
cd backend
.\venv\Scripts\activate
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Terminal 2 (Frontend):
```
cd frontend
npm run dev
```

Open your browser and navigate to ```http://localhost:5173``` Enjoy your private data analyst!

***

### A Few Quick Tips for GitHub:
1.  **`.gitignore` is crucial:** Before you commit this to GitHub, make absolutely sure you have a `.gitignore` file in your root directory that ignores your `node_modules/`, `venv/`, `__pycache__/`, `data/` (so you don't upload private datasets), and most importantly, your `.env` file so your API keys don't leak!
2.  **Screenshots:** Take a screenshot of your beautiful UI with the gallery view and a map showing. Create an `assets` folder, put the image there, and add `![App Screenshot](assets/screenshot.png)` to the top of your README. It makes a massive difference for recruiters!
