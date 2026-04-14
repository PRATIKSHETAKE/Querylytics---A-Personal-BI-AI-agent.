import os
import io
import json
import asyncio
import uuid
import traceback
from datetime import datetime

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security.api_key import APIKeyHeader

from sqlalchemy import create_engine, Column, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma

from app.utils import get_dataframe_schema

# ==============================
# INIT
# ==============================
load_dotenv()
os.makedirs("./vectors", exist_ok=True)
os.makedirs("./data", exist_ok=True)

# ==============================
# SECURITY
# ==============================
API_KEY = "your_secret_handshake_key_here"
api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=False)

async def get_api_key(key: str = Security(api_key_header)):
    if key == API_KEY:
        return key
    raise HTTPException(status_code=403, detail="Unauthorized")

# ==============================
# DATABASE
# ==============================
DATABASE_URL = "sqlite:///./analyst_data.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

class ChatSession(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True)
    name = Column(String)
    filename = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class ChatMessage(Base):
    __tablename__ = "messages"
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"))
    role = Column(String)
    content = Column(Text)
    chart_data = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==============================
# AI SETUP
# ==============================
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

llm = ChatGoogleGenerativeAI(
    model="gemini-3-flash-preview",
    google_api_key=GOOGLE_API_KEY
)

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-2-preview",
    google_api_key=GOOGLE_API_KEY
)

vector_db = Chroma(
    persist_directory="./vectors",
    embedding_function=embeddings
)

def clean_text(content):
    if isinstance(content, list):
        return "".join([c.get("text", "") for c in content if isinstance(c, dict)])
    return str(content)

# ==============================
# APP
# ==============================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/sessions", dependencies=[Depends(get_api_key)])
def list_sessions(db: Session = Depends(get_db)):
    sessions = db.query(ChatSession).order_by(ChatSession.created_at.desc()).all()
    result = []
    for s in sessions:
        msgs = db.query(ChatMessage).filter(ChatMessage.session_id == s.id).order_by(ChatMessage.timestamp).all()
        result.append({
            "id": s.id, "name": s.name, "filename": s.filename,
            "chat": [{"role": m.role, "text": m.content, "chart": m.chart_data} for m in msgs]
        })
    return result

@app.delete("/sessions/{session_id}", dependencies=[Depends(get_api_key)])
def delete_session(session_id: str, db: Session = Depends(get_db)):
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    db.query(ChatSession).filter(ChatSession.id == session_id).delete()
    db.commit()
    return {"status": "deleted"}

# ==============================
# UPLOAD (YOUR PROMPT KEPT)
# ==============================
# ==============================
# UPLOAD
# ==============================
@app.post("/upload", dependencies=[Depends(get_api_key)])
async def upload_file(session_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        contents = await file.read()

        df = pd.read_csv(io.BytesIO(contents)) if file.filename.endswith(".csv") \
            else pd.read_excel(io.BytesIO(contents))

        df.to_pickle(f"data/{file.filename}.pkl")

        rows, cols = df.shape
        schema_text = get_dataframe_schema(df, file.filename)

        # 🚨 REMOVED VECTOR DB CODE HERE TO PREVENT RESOURCE EXHAUSTION/CRASHES 🚨

        # ======================
        # 1. GENERATE SHORT TITLE
        # ======================
        title_prompt = f"Create a short, catchy title (maximum 3 words, under 20 characters) for a dataset named '{file.filename}'. Return strictly ONLY the title text, no quotes, nothing else."
        title_res = await llm.ainvoke(title_prompt)
        # Clean the title and force a 20 character hard limit
        session_title = clean_text(title_res.content).strip().replace('"', '').replace('\n', '')[:20]

        # ======================
        # 2. GENERATE OVERVIEW
        # ======================
        overview_prompt = f"""
        Provide a comprehensive summary of the dataset: {file.filename}. 
        
        1. **Dataset Dimensions**: State clearly that the dataset contains {rows} rows and {cols} columns.
        2. **Brief Overview**: A 2-sentence summary of what this data represents.
        3. **Column Description Table**: A Markdown table with the following headers: 
           | Column Name | Data Type | Description |
        4. **Sample Insights**: Provide 3 to 4 bullet points suggesting interesting analytical questions, potential trends, or key insights a user could explore using this specific data.
        
        Use the following schema context for descriptions and insights: {schema_text}
        """

        res = await llm.ainvoke(overview_prompt)
        overview = clean_text(res.content)

        # ======================
        # 3. SAVE TO DATABASE
        # ======================
        session_entry = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if not session_entry:
            session_entry = ChatSession(id=session_id, name=session_title, filename=file.filename)
            db.add(session_entry)
        else:
            session_entry.filename = file.filename
            session_entry.name = session_title

        db.add(ChatMessage(id=str(uuid.uuid4()), session_id=session_id, role="system", content=f"Source: {file.filename}"))
        db.add(ChatMessage(id=str(uuid.uuid4()), session_id=session_id, role="assistant", content=overview))
        
        # Commit the save!
        db.commit()

        # Send the new name back to the frontend
        return {"overview": overview, "filename": file.filename, "name": session_title}

    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# ==============================
# ANALYZE (YOUR PROMPT KEPT)
# ==============================
# ==============================
# ANALYZE
# ==============================
@app.post("/analyze", dependencies=[Depends(get_api_key)])
async def analyze_data(query: str, filename: str, session_id: str, db: Session = Depends(get_db)):
    try:
        # ======================
        # LOAD DATA
        # ======================
        df = pd.read_pickle(f"data/{filename}.pkl")

        # ======================
        # HISTORY
        # ======================
        past_msgs = db.query(ChatMessage)\
            .filter(ChatMessage.session_id == session_id)\
            .order_by(ChatMessage.timestamp)\
            .all()

        history_context = "\n".join([
            f"{m.role.upper()}: {m.content}" for m in past_msgs[-3:]
        ])

        # ======================
        # LIGHTWEIGHT SCHEMA
        # ======================
        # Replaces the resource-heavy Vector DB similarity search
        columns_info = ", ".join([f"'{col}' ({dtype})" for col, dtype in df.dtypes.items()])

        # ======================
        # STRICT PROMPT
        # ======================
        prompt = f"""
            Analyze the data based on the Available Columns and History.
            Dataset: 'data/{filename}.pkl'
            Available Columns: {columns_info}
            History: {history_context[:1000]}
            Query: {query}
        
            Rules:
            1. STRICT SCHEMA: ONLY use the exact column names listed above. Do not invent columns. Calculate metrics logically from existing columns.
            2. ALWAYS aggregate or sample data to <5000 rows before plotting.
            3. If a MAP is requested: Use the modern `px.scatter_map` or `px.density_map` (DO NOT use 'mapbox'). ALWAYS use `.update_layout(map_style="open-street-map")`.
            4. Define exactly 'answer' (Markdown string) and 'fig' (Plotly Figure).
            5. Return ONLY raw Python code.
        """

        res = await llm.ainvoke(prompt)
        code = clean_text(res.content).replace("```python", "").replace("```", "").strip()

        print("\nGenerated Code:\n", code)

        # ======================
        # SAFE EXECUTION
        # ======================
        ctx = {
            "pd": pd,
            "px": px,
            "go": go,
            "pio": pio,
            "df": df,
            "fig": None,
            "answer": ""
        }

        await asyncio.to_thread(exec, code, ctx)

        fig = ctx.get("fig")
        ans = ctx.get("answer", "Done")

        # ======================
        # AUTO MAP ZOOM FIX
        # ======================
        if fig:
            try:
                lat_col = next((c for c in df.columns if "lat" in c.lower()), None)
                lon_col = next((c for c in df.columns if "lon" in c.lower() or "lng" in c.lower()), None)

                if lat_col and lon_col:
                    sample = df[[lat_col, lon_col]].dropna().sample(min(len(df), 1000))

                    center = {
                        "lat": float(sample[lat_col].mean()),
                        "lon": float(sample[lon_col].mean())
                    }

                    spread = max(
                        sample[lat_col].max() - sample[lat_col].min(),
                        sample[lon_col].max() - sample[lon_col].min()
                    )

                    zoom = 4 if spread > 5 else 7 if spread > 1 else 10 if spread > 0.1 else 12

                    # Fix: Use modern 'map' syntax and dynamic center/zoom calculations
                    fig.update_layout(
                        map=dict(
                            style="open-street-map",
                            center=center,
                            zoom=zoom
                        ),
                        margin={"r":0,"t":40,"l":0,"b":0}
                    )

            except Exception as e:
                print("Map fix failed:", e)

        # ======================
        # SERIALIZE & SAVE
        # ======================
        # Converts NumPy arrays safely, then formats for the SQLite JSON column
        fig_json = json.loads(pio.to_json(fig)) if fig else None

        db.add(ChatMessage(id=str(uuid.uuid4()), session_id=session_id, role="user", content=query))
        db.add(ChatMessage(id=str(uuid.uuid4()), session_id=session_id, role="assistant", content=ans, chart_data=fig_json))
        db.commit()

        return {"analysis": ans, "graph_data": fig_json}

    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# ==============================
# RUN
# ==============================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)