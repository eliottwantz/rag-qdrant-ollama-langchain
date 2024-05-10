import { OLLAMA_URL, createOllamaLLM } from '$lib/ollama';
import {
	EMBEDDINGS_COLLECTION_NAME,
	QDRANT_URL,
	createQdrantRetriever,
	getPoint
} from '$lib/qdrant';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { QdrantVectorStore } from '@langchain/qdrant';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { Document, type DocumentInput } from 'langchain/document';
import { pull } from 'langchain/hub';
import { ChatPromptTemplate } from 'langchain/prompts';
import { RunnableMap } from 'langchain/runnables';
import { StringOutputParser } from 'langchain/schema/output_parser';

export const insertDocuments = async (
	documents: DocumentInput[],
	model: string = 'nomic-embed-text'
) => {
	const store = await QdrantVectorStore.fromTexts(
		documents.map((d) => d.pageContent),
		documents.map((d) => ({ metadata: d.metadata })),
		new OllamaEmbeddings({ model, baseUrl: OLLAMA_URL }),
		{
			url: QDRANT_URL,
			collectionName: EMBEDDINGS_COLLECTION_NAME
		}
	);

	return store;
};

export const generateEmbeddings = async (documents: DocumentInput[]) => {
	const embeddings = new OllamaEmbeddings({
		model: 'nomic-embed-text',
		baseUrl: OLLAMA_URL
	});
	const documentEmbeddings = await embeddings.embedDocuments(documents.map((d) => d.pageContent));
	return documentEmbeddings;
};

export const promptLLM = async (prompt: string, model: string = 'llama3') => {
	const llm = createOllamaLLM(model);
	return await llm.invoke(prompt);
};

export const promptLLMWithKnowledgeBase = async (question: string, model: string = 'llama3') => {
	return await promptLLMWithKnowledge(question, undefined, model);
};

export const promptLLMWithDocument = async (
	question: string,
	docId: string,
	model: string = 'llama3'
) => {
	const document = await getPoint(docId).then((d) => d?.payload?.content as string | undefined);
	if (!document) {
		throw new Error('Document not found');
	}

	console.log('Document:\n', document);

	return await promptLLMWithKnowledge(question, document, model);
};

const promptLLMWithKnowledge = async (
	question: string,
	document?: string,
	model: string = 'llama3'
) => {
	const llm = createOllamaLLM(model);
	const prompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			`Answer any use questions based solely on the context below:

<context>
{context}
</context>`
		],
		['human', '{input}']
	]);

	const documentChain = await createStuffDocumentsChain({
		llm,
		prompt
	});

	let response: string;
	if (document) {
		console.log('Have a document');
		response = await documentChain.invoke({
			input: question,
			context: [new Document({ pageContent: document })]
		});
	} else {
		const retriever = await createQdrantRetriever();

		const retrievalChain = await createRetrievalChain({
			combineDocsChain: documentChain,
			retriever
		});

		response = await retrievalChain
			.invoke({
				input: question
			})
			.then((r) => r.answer);
	}

	console.log('LLM response:\n', response);

	return response;
};
