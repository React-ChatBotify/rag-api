<p align="center">
  <img width="200px" src="https://raw.githubusercontent.com/tjtanjin/llm-proxy/main/assets/logo.png" />
  <h1 align="center">LLM Proxy</h1>
</p>

<p align="center">
  <a href="https://github.com/tjtanjin/llm-proxy/actions/workflows/ci-cd-pipeline.yml"> <img src="https://github.com/tjtanjin/llm-proxy/actions/workflows/ci-cd-pipeline.yml/badge.svg" /> </a>
</p>

## Table of Contents
* [Introduction](#introduction)
* [Features](#features)
* [Technologies](#technologies)
* [Docker Deployment](#docker-deployment)
* [Development Setup](#development-setup)
* [Team](#team)
* [Contributing](#contributing)
* [Others](#others)

### Introduction
**LLM Proxy** is a simple demo project that serves as a proxy for [**OpenAI API**](https://platform.openai.com/) and [**Google Gemini API**](https://ai.google.dev/gemini-api/docs). It also provides an additional custom endpoint for testing purposes. 

**New in this version:** The project now includes a **Retrieval Augmented Generation (RAG)** system. This allows you to upload Markdown documents, which are then chunked, embedded, and stored in a [**ChromaDB**](https://www.trychroma.com/) vector database. You can then query these documents, and the system will retrieve relevant chunks to augment the context provided to the Language Model (LLM), enabling more informed and context-aware responses. A key feature of this RAG implementation is its ability to retrieve and use the full content of the original parent documents from which relevant chunks were found, providing richer context to the LLM.

All functionalities, including the original proxy endpoints and the new RAG endpoints, are exposed via [**Swagger docs**](https://swagger.io/docs/) under the `/api/v1/docs` endpoint.

This demo project was created in private during the development of [**LLM Connector**](https://github.com/React-ChatBotify-Plugins/llm-connector) - an official [**React ChatBotify**](https://react-chatbotify.com) plugin. It has since been made public to serve as a simple demo project (not just for plugin users, but also anyone interested in a simple LLM proxy with RAG capabilities).

Note that this LLM Proxy **is not an official project of React ChatBotify**. With that said, while issues/pull requests are welcome, support for this demo project is **not guaranteed**.

### Features

LLM Proxy offers the following features:

**Core Proxy Endpoints:**
- `/api/v1/openai/chat/completions`: Proxies requests to OpenAI's chat completions API.
- `/api/v1/gemini/models/:model:generateContent`: Proxies requests to Google Gemini's content generation API.
- `/api/v1/gemini/models/:model:streamGenerateContent`: Proxies requests to Google Gemini's streaming content generation API.
- `/api/v1/custom`: A custom endpoint that **always** returns "Hello World!" in a JSON response for basic testing.

**Retrieval Augmented Generation (RAG) System:**
- Document Management:
    - Upload Markdown documents (`.md` files).
    - Documents are chunked, embedded (using a configurable sentence transformer model), and stored in ChromaDB.
    - Endpoints to create, retrieve, update, and delete documents.
- Querying:
    - Public endpoint to query uploaded documents.
    - Relevant document chunks are retrieved based on semantic similarity to the query.
    - The full original content of parent documents corresponding to these chunks is used to augment the LLM prompt.
    - Supports streaming and non-streaming responses from the LLM.

**API Documentation:**
- `/api/v1/docs`: Interactive Swagger UI for exploring and testing all API endpoints.

### Technologies
Technologies used by LLM Proxy are as below:

#### Done with:

<p align="center">
  <img height="150" width="150" src="https://static-00.iconduck.com/assets.00/node-js-icon-454x512-nztofx17.png" />
</p>
<p align="center">
NodeJS
</p>
<p align="center">
  <img height="150" width="150" src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Typescript_logo_2020.svg/2048px-Typescript_logo_2020.svg.png" />
</p>
<p align="center">
Typescript
</p>
<p align="center">
  <img height="150" width="150" src="https://raw.githubusercontent.com/docker/docker.github.io/master/images/Moby-logo.png" />
</p>
<p align="center">
Docker
</p>
<p align="center">
  <img height="150" width="150" src="https://www.trychroma.com/logo.png" />
</p>
<p align="center">
ChromaDB
</p>
<p align="center">
  <img height="150" width="150" src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg" />
</p>
<p align="center">
Hugging Face Transformers (via @xenova/transformers.js)
</p>

#### Project Repository
- https://github.com/tjtanjin/llm-proxy

### Environment Configuration
Before running the application, you need to set up your environment variables.
1.  Copy the `.env.example` file to a new file named `.env`:
    ```bash
    cp .env.example .env
    ```
2.  Edit the `.env` file and provide the necessary values:
    *   `PORT`: Port for the application (defaults to 8000).
    *   `LLM_API_KEY`: Your OpenAI API key (if using OpenAI). (Note: The original template used `GEMINI_API_KEY` and `OPENAI_API_KEY`. This should be updated or clarified based on which keys are actively used by the proxy part).
    *   `OPENAI_API_KEY`: Your OpenAI API key.
    *   `GEMINI_API_KEY`: Your Google Gemini API key.
    *   `RAG_API_KEY`: A secure API key you define for authenticating RAG management endpoints.
    *   `CHROMA_URL`: The URL for the ChromaDB instance. If using the provided `docker-compose.yml`, this will typically be `http://chromadb:8000`.
    *   `EMBEDDING_MODEL_NAME`: The name of the sentence transformer model to use for embeddings (e.g., `Xenova/all-MiniLM-L6-v2`). This model will be downloaded on first use.

### Docker Deployment (with RAG)
The recommended way to deploy the project, including the RAG service and ChromaDB, is using Docker Compose.

1.  **Ensure `.env` is configured:** Follow the steps in "Environment Configuration" above.
2.  **Run Docker Compose:**
    ```bash
    docker-compose up -d --build
    ```
    This command will:
    *   Build the `llm-proxy` service image.
    *   Pull the `chromadb/chroma` image for ChromaDB.
    *   Start both services.
    *   Create a persistent volume for ChromaDB data (`chroma-data`).
3.  **Accessing the Service:**
    *   The LLM Proxy will be available at `http://localhost:${PORT}` (e.g., `http://localhost:8000`).
    *   ChromaDB's API (if needed for direct interaction, though usually not required) will be available at `http://localhost:8001` (as mapped in `docker-compose.yml`).
    *   API documentation (Swagger UI) is available at `http://localhost:${PORT}/api/v1/docs`.

### Development Setup (with RAG)
If you prefer to run the services separately or manage them manually:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/tjtanjin/llm-proxy.git
    cd llm-proxy
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up `.env` file:** As described in "Environment Configuration".
4.  **Run ChromaDB:**
    You can run ChromaDB using Docker separately if you're not using `docker-compose`:
    ```bash
    docker run -d -p 8001:8000 --name chromadb -v chroma-data:/chroma/chroma chromadb/chroma
    ```
    Ensure your `CHROMA_URL` in `.env` points to `http://localhost:8001` in this case.
5.  **Run the LLM Proxy application:**
    ```bash
    npm run dev
    ```
6.  Visit `http://localhost:${PORT}/api/v1/docs` for the Swagger docs page.

### API Endpoints

The LLM Proxy exposes the following sets of API endpoints. All are versioned under `/api/v1/`.

#### Core Proxy Endpoints
These endpoints proxy requests to external LLM providers.
-   `POST /openai/chat/completions`
-   `POST /gemini/models/:model:generateContent`
-   `POST /gemini/models/:model:streamGenerateContent`
-   `GET /custom` (Returns "Hello World!")

#### RAG API Endpoints

##### Management Endpoints
These endpoints are used to manage documents in the RAG system. **They are protected and require an `X-API-Key` header matching the `RAG_API_KEY` defined in your `.env` file.**

-   **`POST /rag/manage/documents`**
    *   Uploads a Markdown document.
    *   Request Content-Type: `multipart/form-data`.
    *   Form fields:
        *   `documentId` (string, required): A unique identifier for the document.
        *   `markdownFile` (file, required): The `.md` file to upload.
-   **`GET /rag/manage/documents/{documentId}`**
    *   Retrieves the original content of an uploaded document.
    *   Path parameter: `documentId`.
-   **`PUT /rag/manage/documents/{documentId}`**
    *   Updates an existing document by replacing its content.
    *   Path parameter: `documentId`.
    *   Request Content-Type: `multipart/form-data`.
    *   Form field:
        *   `markdownFile` (file, required): The new `.md` file.
-   **`DELETE /rag/manage/documents/{documentId}`**
    *   Deletes a document and all its associated chunks from the RAG system.
    *   Path parameter: `documentId`.

##### Query Endpoint (Public)
This endpoint is public and used to query the RAG system.

-   **`POST /rag/query`**
    *   Sends a query to the RAG system. The system retrieves relevant document chunks, augments an LLM prompt with their content (specifically, the original parent documents), and returns the LLM's response.
    *   Request Content-Type: `application/json`.
    *   Request Body:
        *   `query` (string, required): The user's query.
        *   `llm_model` (string, optional): The LLM model to use (e.g., `gpt-3.5-turbo`). Defaults to a system-configured model.
        *   `n_results` (integer, optional): Number of relevant document chunks to retrieve. Defaults to 3.
        *   `stream` (boolean, optional): Whether to stream the response. Defaults to `false`.
    *   Response:
        *   If `stream: false`: A JSON object containing the LLM's response.
        *   If `stream: true`: A `text/event-stream` response.

#### API Documentation
-   `GET /docs`: Interactive Swagger UI for all API endpoints. Accessible at `http://localhost:${PORT}/api/v1/docs`.

### Using the RAG API (Examples)

Replace `your_secure_api_key_here` with the value of `RAG_API_KEY` from your `.env` file.
Replace `/path/to/your/document.md` with the actual path to a Markdown file.
The default port `8000` is used in these examples.

1.  **Upload a document:**
    ```bash
    curl -X POST -H "X-API-Key: your_secure_api_key_here" \
         -F "documentId=my_test_doc_01" \
         -F "markdownFile=@/path/to/your/document.md" \
         http://localhost:8000/api/v1/rag/manage/documents
    ```

2.  **Query the RAG system:**
    ```bash
    curl -X POST -H "Content-Type: application/json" \
         -d '{
               "query": "What is the main content of my_test_doc_01?",
               "stream": false
             }' \
         http://localhost:8000/api/v1/rag/query
    ```
    To stream the response:
    ```bash
    curl -X POST -H "Content-Type: application/json" \
         -d '{
               "query": "Summarize my_test_doc_01 for me.",
               "stream": true
             }' \
         http://localhost:8000/api/v1/rag/query
    ```

3.  **Get a document's content:**
    ```bash
    curl -X GET -H "X-API-Key: your_secure_api_key_here" \
         http://localhost:8000/api/v1/rag/manage/documents/my_test_doc_01
    ```

4.  **Delete a document:**
    ```bash
    curl -X DELETE -H "X-API-Key: your_secure_api_key_here" \
         http://localhost:8000/api/v1/rag/manage/documents/my_test_doc_01
    ```

### Team
* [Tan Jin](https://github.com/tjtanjin)

### Contributing
Given the simplicity and narrowly scoped purpose of this project, there is **no developer guide**. Feel free to submit pull requests if you wish to make improvements or fixes.

Alternatively, you may contact me via [**discord**](https://discord.gg/X8VSdZvBQY) or simply raise bugs or suggestions by opening an [**issue**](https://github.com/tjtanjin/llm-proxy/issues).

### Others
For any questions regarding the implementation of the project, you may reach out on [**discord**](https://discord.gg/X8VSdZvBQY) or drop an email to: cjtanjin@gmail.com.
