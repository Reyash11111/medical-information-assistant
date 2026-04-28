import os
import pickle
from pathlib import Path
from typing import Dict, List, Any

from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferWindowMemory
from langchain.prompts import PromptTemplate

load_dotenv()

FAISS_INDEX_DIR = "./faiss_index"
EMBED_MODEL     = "sentence-transformers/all-MiniLM-L6-v2"

MEDICAL_SYSTEM_PROMPT = """You are a knowledgeable medical professional providing helpful information.
Write your responses as though you are a real human expert who has studied the topic carefully.

IMPORTANT writing style rules:
- Write in natural, flowing paragraphs. Do NOT use bullet points, numbered lists, or markdown formatting.
- Vary your sentence lengths. Mix short, punchy sentences with longer explanatory ones.
- Use conversational transitions like "That said," "It's worth noting that," "In practice," "From what we know," etc.
- Avoid robotic or formulaic phrasing. Sound like a thoughtful person who genuinely understands the material.
- Do not use bold, italics, headers, or any special formatting. Just plain text paragraphs.
- Do not start with "Based on the provided context" or similar AI-like phrases.
- If the provided documents don't cover the question, answer using your general knowledge, but naturally weave in that this is general information and not from the specific provided documents.
- Gently remind the reader to consult a healthcare professional when appropriate, but weave it into the text naturally rather than as a disclaimer at the end.
- Never fabricate medical facts or drug information.

Context from medical documents:
{context}

Chat History:
{chat_history}

Human Question: {question}

Answer:"""

MEDICAL_PROMPT = PromptTemplate(
    input_variables=["context", "chat_history", "question"],
    template=MEDICAL_SYSTEM_PROMPT
)


class MedicalRAGEngine:
    def __init__(self):
        self._embeddings = HuggingFaceEmbeddings(
            model_name=EMBED_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )

        self._vectorstore = self._load_or_create_vectorstore()

        self._llm = ChatGoogleGenerativeAI(
            model="gemini-flash-latest",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
            temperature=0.2,
            max_tokens=1024,
        )

        # Per-session conversation memory
        self._memories: Dict[str, ConversationBufferWindowMemory] = {}

        self._text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=100,
            separators=["\n\n", "\n", ". ", " ", ""],
        )


    def ingest_document(self, file_path: str) -> int:
        """Load a PDF, split into chunks, and store in FAISS. Returns chunk count."""
        loader = PyPDFLoader(file_path)
        pages  = loader.load()

        filename = Path(file_path).name
        for page in pages:
            page.metadata["source"] = filename

        chunks = self._text_splitter.split_documents(pages)

        if self._vectorstore is None:
            self._vectorstore = FAISS.from_documents(chunks, self._embeddings)
        else:
            self._vectorstore.add_documents(chunks)

        self._save_vectorstore()
        return len(chunks)

    def answer(self, question: str, session_id: str) -> Dict[str, Any]:
        """Run the RAG pipeline for a single question/session."""
        memory   = self._get_memory(session_id)

        if self._vectorstore is None or self.get_doc_count() == 0:
            from langchain.chains import LLMChain
            prompt = PromptTemplate(
                input_variables=["chat_history", "question"],
                template="""You are a knowledgeable medical professional providing helpful information.
Write your responses as though you are a real human expert who has studied the topic carefully.
Do not use markdown formatting like bold, italics, or lists. Answer in plain paragraphs.
Answer using your general medical knowledge.

Chat History:
{chat_history}

Human Question: {question}

Answer:"""
            )
            chain = LLMChain(llm=self._llm, prompt=prompt, memory=memory)
            result = chain.invoke({"question": question})
            return {"answer": result["text"], "sources": []}

        retriever = self._vectorstore.as_retriever(
            search_type="mmr",
            search_kwargs={"k": 5, "fetch_k": 20, "lambda_mult": 0.7},
        )

        chain = ConversationalRetrievalChain.from_llm(
            llm=self._llm,
            retriever=retriever,
            memory=memory,
            combine_docs_chain_kwargs={"prompt": MEDICAL_PROMPT},
            return_source_documents=True,
            verbose=False,
        )

        result  = chain.invoke({"question": question})
        sources = self._extract_sources(result.get("source_documents", []))

        return {"answer": result["answer"], "sources": sources}

    def get_doc_count(self) -> int:
        try:
            if self._vectorstore is None:
                return 0
            return self._vectorstore.index.ntotal
        except Exception:
            return 0

    def remove_document(self, filename: str):
        """Rebuild the FAISS index without chunks from *filename*."""
        try:
            if self._vectorstore is None:
                return
            # FAISS doesn't support deletion; rebuild from remaining docs
            store = self._vectorstore.docstore._dict
            remaining = [
                doc for doc in store.values()
                if doc.metadata.get("source") != filename
            ]
            if remaining:
                self._vectorstore = FAISS.from_documents(remaining, self._embeddings)
            else:
                self._vectorstore = None
            self._save_vectorstore()
        except Exception as e:
            print(f"Warning: could not remove {filename}: {e}")

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _load_or_create_vectorstore(self):
        index_path = Path(FAISS_INDEX_DIR)
        if index_path.exists() and (index_path / "index.faiss").exists():
            try:
                return FAISS.load_local(
                    FAISS_INDEX_DIR,
                    self._embeddings,
                    allow_dangerous_deserialization=True,
                )
            except Exception as e:
                print(f"Could not load FAISS index: {e}. Starting fresh.")
        return None

    def _save_vectorstore(self):
        if self._vectorstore is not None:
            Path(FAISS_INDEX_DIR).mkdir(exist_ok=True)
            self._vectorstore.save_local(FAISS_INDEX_DIR)

    def _get_memory(self, session_id: str) -> ConversationBufferWindowMemory:
        if session_id not in self._memories:
            self._memories[session_id] = ConversationBufferWindowMemory(
                k=5,
                memory_key="chat_history",
                return_messages=True,
                output_key="answer",
            )
        return self._memories[session_id]

    @staticmethod
    def _extract_sources(docs: list) -> List[str]:
        seen, sources = set(), []
        for doc in docs:
            src   = doc.metadata.get("source", "Unknown")
            page  = doc.metadata.get("page", "?")
            label = f"{src} (page {int(page) + 1})"
            if label not in seen:
                seen.add(label)
                sources.append(label)
        return sources
