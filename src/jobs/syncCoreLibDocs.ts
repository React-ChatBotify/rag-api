import axios, { AxiosResponse } from 'axios';
import dotenv from 'dotenv';
import FormData from 'form-data';
import { Octokit } from 'octokit';
import path from 'path';

dotenv.config();

// RAG API Configuration
const RAG_MANAGEMENT_API_KEY = process.env.RAG_MANAGEMENT_API_KEY;
const PORT = process.env.PORT ?? 8080;
const API_VERSION = process.env.API_VERSION ?? 'v1';
const API_BASE_URL = `http://localhost:${PORT}/api/${API_VERSION}`;

// GitHub Configuration
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? 'react-chatbotify';
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME ?? 'core-library-documentation';
const GITHUB_DOCS_PATH = process.env.GITHUB_DOCS_PATH ?? 'docs';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!API_BASE_URL || !RAG_MANAGEMENT_API_KEY) {
  console.error('Error: API_BASE_URL and RAG_MANAGEMENT_API_KEY must be set in the .env file.');
  process.exit(1);
}
if (!GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
  console.error('Error: GITHUB_REPO_OWNER and GITHUB_REPO_NAME must be set in the .env file.');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'X-API-Key': RAG_MANAGEMENT_API_KEY },
});

type GitHubFile = {
  download_url: string;
  sha: string;
  path: string;
};

const getRemoteMarkdownFilesFromGitHub = async (): Promise<Map<string, GitHubFile>> => {
  const remoteFiles = new Map<string, GitHubFile>();

  async function fetchDirContents(dirPath: string): Promise<void> {
    try {
      console.log(`Fetching contents from GitHub: ${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${dirPath}`);
      const response: AxiosResponse<any[]> = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: GITHUB_REPO_OWNER!,
        path: dirPath,
        repo: GITHUB_REPO_NAME!,
      });
      const contents = response.data;

      for (const item of contents) {
        if (item.type === 'dir') {
          await fetchDirContents(item.path as string);
        } else if (item.type === 'file' && item.name.endsWith('.md')) {
          remoteFiles.set(item.path as string, {
            download_url: item.download_url as string,
            path: item.path as string,
            sha: item.sha as string,
          });
          console.log(`Found GitHub file: ${item.path}`);
        }
      }
    } catch (error: any) {
      console.error(`Error fetching directory contents for ${dirPath} from GitHub:`, error.message);
      throw error;
    }
  }

  await fetchDirContents(GITHUB_DOCS_PATH);
  console.log(`Total Markdown files fetched from GitHub: ${remoteFiles.size}`);
  return remoteFiles;
};

const fetchGitHubFileContent = async (downloadUrl: string): Promise<Buffer> => {
  try {
    const response = await axios.get<ArrayBuffer>(downloadUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error: any) {
    console.error(`Error fetching file content from ${downloadUrl}:`, error.message);
    throw error;
  }
};

const getRemoteRagDocuments = async (): Promise<Set<string>> => {
  try {
    const response = await apiClient.get(`/api/${API_VERSION}/rag/manage/documents`);
    const data = response.data;
    if (Array.isArray(data)) {
      if (data.every((item) => typeof item === 'object' && 'documentId' in item)) {
        return new Set(data.map((doc: any) => doc.documentId as string));
      }
      if (data.every((item) => typeof item === 'string')) {
        return new Set(data as string[]);
      }
    } else if (data && Array.isArray(data.documents)) {
      return new Set((data.documents as any[]).map((doc) => doc.documentId as string));
    }
    console.warn(`Warning: Unexpected response format for GET /documents. Received: ${JSON.stringify(data)}`);
    return new Set();
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log("No documents found in RAG (404), assuming it's empty.");
      return new Set();
    }
    console.error('Error fetching remote RAG documents:', error.message);
    return new Set();
  }
};

const createDocument = async (documentId: string, gitHubFile: GitHubFile): Promise<void> => {
  try {
    console.log(`Creating RAG document: ${documentId}`);
    const fileContent = await fetchGitHubFileContent(gitHubFile.download_url);
    const formData = new FormData();
    formData.append('documentId', documentId);
    formData.append('markdownFile', fileContent, {
      contentType: 'text/markdown',
      filename: path.basename(documentId),
    });
    await apiClient.post(`/api/${API_VERSION}/rag/manage/documents`, formData, {
      headers: formData.getHeaders(),
    });
    console.log(`CREATED in RAG: ${documentId}`);
  } catch (error: any) {
    console.error(`Error creating document ${documentId} in RAG:`, error.response?.data ?? error.message);
  }
};

const updateDocument = async (documentId: string, gitHubFile: GitHubFile): Promise<void> => {
  try {
    console.log(`Updating RAG document: ${documentId}`);
    const fileContent = await fetchGitHubFileContent(gitHubFile.download_url);
    const formData = new FormData();
    formData.append('markdownFile', fileContent, {
      contentType: 'text/markdown',
      filename: path.basename(documentId),
    });
    await apiClient.put(`/api/${API_VERSION}/rag/manage/documents/${documentId}`, formData, {
      headers: formData.getHeaders(),
    });
    console.log(`UPDATED in RAG: ${documentId}`);
  } catch (error: any) {
    console.error(`Error updating document ${documentId} in RAG:`, error.response?.data ?? error.message);
  }
};

const deleteDocument = async (documentId: string): Promise<void> => {
  try {
    await apiClient.delete(`/api/${API_VERSION}/rag/manage/documents/${documentId}`);
    console.log(`DELETED from RAG: ${documentId}`);
  } catch (error: any) {
    console.error(`Error deleting document ${documentId} from RAG:`, error.response?.data ?? error.message);
  }
};

const runSyncDocuments = async (): Promise<void> => {
  console.log('Starting RAG document synchronization from GitHub...');
  let gitHubFilesMap: Map<string, GitHubFile>;
  try {
    gitHubFilesMap = await getRemoteMarkdownFilesFromGitHub();
  } catch (error: any) {
    console.error('Failed to fetch files from GitHub. Aborting sync.', error.message);
    process.exit(1);
    return;
  }

  if (gitHubFilesMap.size === 0) {
    console.log(`No Markdown files found in ${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_DOCS_PATH}.`);
  }

  const remoteRagDocumentIds = await getRemoteRagDocuments();
  console.log(`Found ${gitHubFilesMap.size} markdown files on GitHub.`);
  console.log(`Found ${remoteRagDocumentIds.size} documents in the RAG system.`);

  const gitHubDocumentIds = new Set(gitHubFilesMap.keys());
  const toCreate: { id: string; file: GitHubFile }[] = [];
  const toUpdate: { id: string; file: GitHubFile }[] = [];
  const toDelete: string[] = [];

  for (const [docId, fileDetails] of gitHubFilesMap.entries()) {
    if (remoteRagDocumentIds.has(docId)) {
      toUpdate.push({ file: fileDetails, id: docId });
    } else {
      toCreate.push({ file: fileDetails, id: docId });
    }
  }

  for (const remoteId of remoteRagDocumentIds) {
    if (!gitHubDocumentIds.has(remoteId)) {
      toDelete.push(remoteId);
    }
  }

  console.log('\n--- Sync Summary ---');
  console.log(`${toCreate.length} documents to create in RAG.`);
  console.log(`${toUpdate.length} documents to update in RAG.`);
  console.log(`${toDelete.length} documents to delete from RAG.`);

  if (toCreate.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
    console.log('RARag system is already up to date with GitHub repository!');
    return;
  }

  console.log('--- Starting RAG API Operations ---');
  for (const { id, file } of toCreate) {
    await createDocument(id, file);
  }
  for (const { id, file } of toUpdate) {
    await updateDocument(id, file);
  }
  for (const id of toDelete) {
    await deleteDocument(id);
  }

  console.log('\nSynchronization complete.');
};

export { runSyncDocuments };
