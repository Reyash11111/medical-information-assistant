Medical Information Assistant (RAG)

A production-quality Retrieval-Augmented Generation (RAG) system for medical information, built with:

| Layer               | Technology                                            |
| LLM                 | Google Gemini 1.5 Flash                               |
| Embeddings          | sentence-transformers/all-MiniLM-L6-v2 (local, free)  |
| Vector Store        | ChromaDB (persistent)                                 |
| RAG Framework       | LangChain                                             |
| Backend             | FastAPI                                               |
| Frontend            | Vanilla HTML/CSS/JS (dark glassmorphism UI)           |


1. Create virtual environment
bash
python -m venv venv
Windows:
venv\Scripts\activate


2. Install dependencies
bash
pip install -r requirements.txt


3. Configure API key
bash
copy .env.example .env


 4. Run the server
bash
python main.py

 5. Open the app
Visit http://localhost:8000 in your browser.

Project Structure : 

rag/
├── main.py              
├── rag_engine.py        
├── requirements.txt
├── .env.example
├── static/
│   ├── index.html       
│   ├── style.css        
│   └── app.js           
├── uploaded_docs/       
└── chroma_db/           


Working of RAG : 

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
 Answer


API Endpoints

| Method  | Endpoint           | Description                                 |
|GET     | /                  | Frontend UI                                 |
|GET     | /health            | Health check + doc count                    |
|POST    | /upload            | Upload a PDF to knowledge base              |
|POST    | /chat              | Ask a medical question                      |
|GET     | /documents         | List indexed documents                      |
|DELETE  | /documents/{name}  | Remove a document                           |


