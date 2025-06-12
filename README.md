<p align="center">
  <img width="200px" src="https://raw.githubusercontent.com/react-chatbotify/rag-api/main/assets/logo.png" />
  <h1 align="center">React ChatBotify RAG API</h1>
</p>

<p align="center">
  <a href="https://github.com/react-chatbotify/rag-api/actions/workflows/ci-cd-pipeline.yml"> <img src="https://github.com/react-chatbotify/rag-api/actions/workflows/ci-cd-pipeline.yml/badge.svg" /> </a>
</p>

## Table of Contents
* [Introduction](#introduction)
* [Features](#features)
* [Technologies](#technologies)
* [Setup](#setup)
* [Docker Deployment](#docker-deployment)
* [Team](#team)
* [Contributing](#contributing)
* [Others](#others)

### Introduction
**React ChatBotify RAG API** is a lightweight project that serves as an LLM proxy for [**Google Gemini API**](https://ai.google.dev/gemini-api/docs). Notably, it is curated to pick out and utilize knowledge specific to React ChatBotify.

The project includes a **Retrieval Augmented Generation (RAG)** system. This allows one to upload Markdown documents, which are then chunked, embedded, and stored in a [**ChromaDB**](https://www.trychroma.com/) vector database. When queries are received, the system will retrieve relevant chunks to augment the context provided to the Language Model (LLM), enabling more informed and context-aware responses. A key feature of this RAG implementation is its ability to retrieve and use the full content of the original parent documents from which relevant chunks were found, providing richer context to the LLM.

All functionalities, including both query and management endpoints, are exposed via [**Swagger docs**](https://swagger.io/docs/) under the `/api/v1/docs` endpoint.

Note that this project is a fork of the [**LLM Proxy**](https://github.com/tjtanjin/llm-proxy), which is a simpler alternative as a proxy with no support for RAG.

### Features

React ChatBotify RAG API offers the following features:

**Query Endpoints:**
- POST `/api/v1/gemini/models/{model}:generateContent`: Proxies requests to Google Gemini's content generation API.
- POST `/api/v1/gemini/models/{model}:streamGenerateContent`: Proxies requests to Google Gemini's streaming content generation API.

**Management Endpoints:**
- POST `/api/v1/rag/manage/documents`: Creates a new document in the RAG system.
- GET `/api/v1/rag/manage/documents/{documentId}`: Retrieves a document by its ID.
- PUT `/api/v1/rag/manage/documents/{documentId}`: Updates an existing document.
- DELETE `/api/v1/rag/manage/documents/{documentId}`: Deletes a document by its ID.

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

**API Key Capabilities:**
- `RAG_MANAGEMENT_API_KEY`: Can perform both management operations (creating, updating, deleting documents) and query operations.
- `RAG_QUERY_API_KEY`: Can perform query operations only (generating content or streaming content generation). It cannot be used for management operations.

### Technologies
Technologies used by React ChatBotify RAG API are as below:

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

#### Project Repository
- https://github.com/react-chatbotify/rag-api

### Setup
Before running the application, you need to set up your environment variables. Also make sure you have docker installed.
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/react-chatbotify/rag-api.git
    cd rag-api
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  Copy the `.env.template` file (found under the `config/env/` folder) to a new file named `.env`:
    ```bash
    cp ./config/env.env.template ./config/env/.env
    ```
4.  Edit the `.env` file and provide the necessary values as described in the template.
5.  Run `npm run start`.
6.  Visit `http://localhost:${PORT}/api/v1/docs` for the Swagger docs page.

### Docker Deployment
The recommended way to deploy the project, including the RAG service and ChromaDB, is using Docker Compose.

1.  **Ensure `.env` is configured:** Follow the steps in "Environment Configuration" above.
2.  **Run Docker Compose:**
    ```bash
    docker-compose up -d --build
    ```
    This command will:
    *   Build the `rag-api` service image.
    *   Pull the `chromadb/chroma` image for ChromaDB.
    *   Pull the `mongodb` image for mongodb.
    *   Start all services.
    *   Create a persistent volume for ChromaDB and MongoDB.
3.  **Accessing the Service:**
    *   The RAG API will be available at `http://localhost:${PORT}` (e.g., `http://localhost:8080`).
    *   ChromaDB's API (if needed for direct interaction, though usually not required) will be available at `http://localhost:8001` (as mapped in `docker-compose.yml`).
    *   API documentation (Swagger UI) is available at `http://localhost:${PORT}/api/v1/docs`.

### Team
* [Tan Jin](https://github.com/tjtanjin)

### Contributing
There is currently no developer guide for the project. This will be written soon. In the meantime, if you're keen to make improvements, the codebase is relatively small for exploration.

Alternatively, you may reach out via [**discord**](https://discord.gg/6R4DK4G5Zh) or simply raise bugs or suggestions by opening an [**issue**](https://github.com/react-chatbotifyy/rag-api/issues).

### Others
For any questions regarding the implementation of the project, you may reach out on [**discord**](https://discord.gg/6R4DK4G5Zh) or drop an email to: cjtanjin@gmail.com.
