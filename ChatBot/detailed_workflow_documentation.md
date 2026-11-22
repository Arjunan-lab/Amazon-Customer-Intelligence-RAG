# Amazon RAG Chatbot: Detailed Technical Documentation

This document provides a comprehensive, corner-to-corner breakdown of the Amazon Customer Support Chatbot. It explains the entire architecture, every technology used, and the exact step-by-step workflow of how data moves through the system from the moment a user types a message to the moment the AI responds.

---

## 1. System Architecture Overview
The project is divided into three distinct layers, deeply integrated to provide a seamless AI experience.

### 1.1 The Frontend (Client Layer)
- **Framework**: `React.js` (bootstrapped with `Vite` for ultra-fast Hot Module Replacement and optimized builds).
- **Styling**: Pure `CSS3` with custom properties (CSS Variables) for a consistent design system. We implemented a "Glassmorphism" UI with deep Amazon branding (Orange and Dark themes), pulsating animations, and holographic effects.
- **Responsibility**: Takes user input, displays the chat history, renders the "Data Nodes" (the raw reviews the AI used), and handles the loading states while the Backend thinks.

### 1.2 The Backend (API/Middleware Layer)
- **Runtime**: `Node.js` (v22+).
- **Framework**: `Express.js`.
- **Purpose**: Acts as the traffic controller. It provides REST APIs (`/api/chat` and `/api/health`). Crucially, it uses Node's `child_process.spawn` to securely trigger the Python AI engine, passing the user's question as a command-line argument, capturing the Python script's `stdout` (JSON output), and returning it to the React frontend.

### 1.3 The AI Engine (The RAG Pipeline)
- **Language**: `Python 3.1x`.
- **Paradigm**: Retrieval-Augmented Generation (RAG).
- **Purpose**: This is the core intelligence. It completely bypasses standard database lookups. Instead, it reads through 10,000 real Amazon reviews, mathematically finds the 5 most relevant ones, and uses a Large Language Model to write a human-like answer.

---

## 2. In-Depth Workflow: How a Question is Answered

Let's trace the exact path when a user types: *"What are the common complaints about the battery life on the Fire HD 8?"*

### Step 1: The Request (Frontend -> Backend)
1. The user presses **Send** in the React application.
2. The [api.js](file:///f:/Coding/VS%20CODE/Industry/AI%20Class/ChatBot/amazon-rag-chatbot/frontend/src/api.js) file uses the `axios` library to send an HTTP POST request to `http://localhost:5000/api/chat` with `{ "question": "..." }`.
3. The React UI instantly creates a "Synthesizing vectors..." loading bubble to keep the user engaged.

### Step 2: The Hand-Off (Backend -> Python)
1. Express.js receives the request in [routes/chat.js](file:///f:/Coding/VS%20CODE/Industry/AI%20Class/ChatBot/amazon-rag-chatbot/backend/routes/chat.js).
2. It calls the [services/pythonService.js](file:///f:/Coding/VS%20CODE/Industry/AI%20Class/ChatBot/amazon-rag-chatbot/backend/services/pythonService.js) module.
3. Node.js executes a shell command: `python f:\...\rag_model\rag_pipeline.py "What are the common complaints..."`.
4. It sets up a listener, waiting for the Python script to print a specific JSON string starting with `__RAG_RESULT__`.

### Step 3: Initialization & Embedding (Python)
1. The Python script ([rag_pipeline.py](file:///f:/Coding/VS%20CODE/Industry/AI%20Class/ChatBot/amazon-rag-chatbot/rag_model/rag_pipeline.py)) awakens. It immediately loads the `all-mpnet-base-v2` embedding model.
2. It takes the user's question and mathematically transforms the words into a dense vector (a list of 768 floating-point numbers) that represents the *semantic meaning* of the question.

### Step 4: The Vector Search (FAISS)
1. The script loads the pre-compiled [faiss_index.bin](file:///f:/Coding/VS%20CODE/Industry/AI%20Class/ChatBot/amazon-rag-chatbot/rag_model/faiss_index.bin). FAISS (Facebook AI Similarity Search) is a highly specialized database designed strictly for storing and comparing vectors.
2. It compares the question's vector against the 10,000 review vectors stored in memory. It uses "Cosine Similarity" to find vectors pointing in the exact same mathematical direction.
3. Within 0.1 seconds, FAISS returns the Top 5 most relevant reviews (e.g., reviews specifically mentioning "Fire HD 8", "battery dies fast", or "charge doesn't hold").

### Step 5: System Prompting & Ambiguity Checks
1. The Python script retrieves the raw text and product names of those Top 5 reviews.
2. It formats them into a strict "System Prompt."
3. **The Ambiguity Check**: The system prompt contains strict logical rules. It forces the AI to check if the user actually mentioned a product. If the user just said *"How is the battery?"*, the LLM is programmed to abort the answer and instead ask: *"Which product do you mean?"*

### Step 6: Generation (The Heavy Lifting)
1. The combined Prompt + Reviews + Instructions are fed into `Qwen2.5-1.5B-Instruct` (a 1.5 Billion parameter Large Language Model).
2. Because the system is running on your Intel i7 CPU (without a dedicated GPU), the CPU maxes out processing these billions of calculations to generate the text token by token.
3. The LLM writes a cohesive paragraph summarizing the 5 reviews.

### Step 7: The Return
1. Python prints the final Answer and the 5 source texts as JSON to the console.
2. Node.js captures this JSON, parses it, and sends it back as an HTTP 200 OM to React.
3. React updates the UI, replacing the loading bubble with the AI's final answer and rendering the "Data Nodes" so the user can see exactly which reviews the AI used to build its answer.

---

## 3. Corner-to-Corner Technology Stack

### 3.1 Data Preparation Technologies
- **`pandas`**: The industry standard Python data manipulation library. Used to read the `amazon_reviews_pro.csv` file, clean NaN (empty) values, and combine the "Review Title" and "Review Body" into a single, cohesive string.
- **`openpyxl` & `xlrd`**: Backup parsers capable of reading native Excel files, ensuring data flexibility.

### 3.2 Machine Learning & AI Libraries
- **`sentence-transformers`**: A Python framework specifically designed to compute sentence, text, and image embeddings. We use it to load `all-mpnet-base-v2`.
- **`transformers` (HuggingFace)**: The core library that handles downloading and executing state-of-the-art machine learning models. We use this to run the `Qwen2.5` LLM.
- **`PyTorch`**: The underlying tensor math library (built by Meta) that actually executes the mathematical operations required by the HuggingFace models.
- **`accelerate`**: A HuggingFace library installed to optimize memory usage and CPU inference speeds.

### 3.3 The Specific AI Models Used
*(These are extremely important. We did not train these from scratch; we leveraged open-source titans and deployed them locally.)*

1. **The Embedding Model (`sentence-transformers/all-mpnet-base-v2`)**
   - *Why this one?* It consistently ranks at the top of the MTEB (Massive Text Embedding Benchmark) for its size. It maps sentences to a 768-dimensional vector space perfectly optimized for semantic search.

2. **The Generative LLM (`Qwen/Qwen2.5-1.5B-Instruct`)**
   - *Why this one?* Built by Alibaba Cloud, the Qwen2.5 family is currently dominating open-source benchmarks. The 1.5B (Billion) parameter version was deliberately chosen because it is the "sweet spot" for running on an Intel Core i7 CPU. It is small enough to run without crashing your 16GB of RAM, but smart enough to follow the complex "Ambiguity Handling" logic we programmed into the System Prompt.

### 3.4 Vector Storage
- **`faiss-cpu`**: Facebook's open-source library for efficient similarity search and clustering of dense vectors. 
  - *How we use it*: When [warmup.py](file:///f:/Coding/VS%20CODE/Industry/AI%20Class/ChatBot/amazon-rag-chatbot/rag_model/warmup.py) runs, we generate 10,000 vectors. We add them to a `faiss.IndexFlatL2` index. This index is saved as a [.bin](file:///f:/Coding/VS%20CODE/Industry/AI%20Class/ChatBot/amazon-rag-chatbot/rag_model/faiss_index.bin) file on your hard drive, allowing the system to boot up instantly rather than regenerating the vectors every time you start the server.

### 3.5 Development Tools
- **`npm` (Node Package Manager)**: Used to manage all frontend and backend Javascript dependencies.
- **`pip`**: Used to manage all Python dependencies.
- **`nodemon`**: Used locally in the backend for hot-reloading the Node server upon file changes.
- **`concurrently`**: (Often used in these setups) to run both the React Vite server and the Express backend simultaneously with one command.

---

## 4. Key Engineering Decisions & Trade-offs

1. **Local vs Cloud Execution**
   - We chose to run the LLM locally on your PC. 
   - *Pro*: 100% free, complete privacy, no rate limits. 
   - *Con*: Because you lack a dedicated NVIDIA GPU, generation times are bottlenecked by the CPU, resulting in a 30-60 second wait per query.
2. **The "Warmup" Script**
   - Instead of trying to index 10,000 Excel rows every time the server starts, we created [warmup.py](file:///f:/Coding/VS%20CODE/Industry/AI%20Class/ChatBot/amazon-rag-chatbot/rag_model/warmup.py). This processes the data and saves it to [.bin](file:///f:/Coding/VS%20CODE/Industry/AI%20Class/ChatBot/amazon-rag-chatbot/rag_model/faiss_index.bin) and [.pkl](file:///f:/Coding/VS%20CODE/Industry/AI%20Class/ChatBot/amazon-rag-chatbot/rag_model/documents.pkl) files. The live server simply loads these files into RAM in milliseconds.
3. **Structured Context Mapping**
   - We specifically mapped the product name from the dataset directly into the Python dictionary, passing it all the way to the Vector Store and LLM. This allows the React UI to beautifully highlight the exact Product Name on the "Data Node" UI cards.
