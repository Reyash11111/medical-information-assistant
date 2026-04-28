import os
import shutil
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from rag_engine import MedicalRAGEngine
load_dotenv()
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exception_handlers import RequestValidationError
from fastapi.exceptions import RequestValidationError as FastAPIRequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import traceback

app = FastAPI(
    title="Medical Information Assistant API",
    description="RAG-powered medical information assistant",
    version="1.0.0"
)
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    # Log the traceback for debugging
    tb = traceback.format_exc()
    print(f"Unhandled Exception: {tb}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "trace": tb},
    )

# Optionally, handle validation errors as JSON
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

UPLOAD_DIR = Path("uploaded_docs")
UPLOAD_DIR.mkdir(exist_ok=True)
rag_engine = MedicalRAGEngine()
class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[str]
    session_id: str


class DocumentStatus(BaseModel):
    filename: str
    status: str
    chunks: int
@app.get("/", include_in_schema=False)
async def root():
    return FileResponse("static/index.html")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "documents_loaded": rag_engine.get_doc_count()}


@app.post("/upload", response_model=DocumentStatus)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """Upload a medical PDF document to the knowledge base."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    chunks = rag_engine.ingest_document(str(file_path))

    return DocumentStatus(
        filename=file.filename,
        status="indexed",
        chunks=chunks
    )


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Ask a medical question using the RAG pipeline."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    session_id = request.session_id or str(uuid.uuid4())

    result = rag_engine.answer(request.question, session_id)

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
        session_id=session_id
    )


@app.get("/documents")
async def list_documents():
    """List all indexed documents."""
    docs = [f.name for f in UPLOAD_DIR.glob("*.pdf")]
    return {"documents": docs, "total": len(docs)}


@app.delete("/documents/{filename}")
async def delete_document(filename: str):
    """Remove a document from the knowledge base."""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document not found.")
    file_path.unlink()
    rag_engine.remove_document(filename)
    return {"message": f"{filename} removed successfully."}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
