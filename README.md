# 🩺 MediAssist – Medical Information Assistant (RAG)

A production-quality **Retrieval-Augmented Generation (RAG)** system for medical information, built with:

| Layer | Technology |
|---|---|
| **LLM** | Google Gemini 1.5 Flash |
| **Embeddings** | sentence-transformers/all-MiniLM-L6-v2 (local, free) |
| **Vector Store** | ChromaDB (persistent) |
| **RAG Framework** | LangChain |
| **Backend** | FastAPI |
| **Frontend** | Vanilla HTML/CSS/JS (dark glassmorphism UI) |

---

## 🚀 Quick Start

### 1. Create virtual environment
```bash
python -m venv venv
# Windows:
venv\Scripts\activate
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure API key
```bash
copy .env.example .env
# Then open .env and paste your Google AI Studio API key
# Get free key at: https://aistudio.google.com/app/apikey
```

### 4. Run the server
```bash
python main.py
```

### 5. Open the app
Visit **http://localhost:8000** in your browser.

---

## 📂 Project Structure

```
rag/
├── main.py              ← FastAPI app + API routes
├── rag_engine.py        ← Core RAG pipeline (ChromaDB + Gemini)
├── requirements.txt
├── .env.example
├── static/
│   ├── index.html       ← Frontend UI
│   ├── style.css        ← Design system
│   └── app.js           ← Frontend logic
├── uploaded_docs/       ← Uploaded PDFs (auto-created)
└── chroma_db/           ← ChromaDB vector store (auto-created)
```

---

## 🔑 How to Get a Gemini API Key (Free)

1. Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with Google
3. Click **"Create API Key"**
4. Copy it into your `.env` file as `GOOGLE_API_KEY=...`

---

## 🧠 How RAG Works Here

```
User Question
      │
      ▼
 HuggingFace Embeddings
      │  (convert question to vector)
      ▼
 ChromaDB Similarity Search (MMR)
      │  (retrieve top-5 most relevant chunks)
      ▼
 LangChain ConversationalRetrievalChain
      │  (inject context + chat history into prompt)
      ▼
 Google Gemini 1.5 Flash
      │  (generate medically grounded answer)
      ▼
 Answer + Source Citations
```

---

## 📋 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Frontend UI |
| `GET` | `/health` | Health check + doc count |
| `POST` | `/upload` | Upload a PDF to knowledge base |
| `POST` | `/chat` | Ask a medical question |
| `GET` | `/documents` | List indexed documents |
| `DELETE` | `/documents/{name}` | Remove a document |

---

## ⚕️ Disclaimer

MediAssist provides information for **educational purposes only**. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional.
