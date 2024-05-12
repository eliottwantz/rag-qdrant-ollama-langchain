import { DocumentSchema } from '$lib/document';
import {
	chatLLM,
	generateEmbeddings,
	insertDocuments,
	promptLLM,
	promptLLMWithDocument,
	promptLLMWithKnowledgeBase
} from '$lib/langchain';
import { Stream } from '@elysiajs/stream';
import { listModels } from '$lib/ollama';
import {
	EMBEDDINGS_COLLECTION_NAME,
	createQdrantClient,
	ensureCollection,
	getPoint
} from '$lib/qdrant';
import cors from '@elysiajs/cors';
import swagger from '@elysiajs/swagger';
import { Elysia, t } from 'elysia';

await ensureCollection();

export const api = new Elysia({ prefix: '/api' })
	.use(cors())
	.use(swagger())
	.get('/', () => 'rad-qdrant 🔥😁👍')
	.get('/models', async () => {
		const models = await listModels();
		if (!models) {
			return {
				error: 'No local ollama models installed. Go to https://ollama.com/library to install one.'
			};
		}
		return { models: models.map((m) => m.name) };
	})
	.post(
		'/prompt',
		async ({ body, error }) => {
			console.log('Question from user:', body.prompt);
			try {
				const res = await promptLLM(body.prompt);
				return { answer: res };
			} catch (e) {
				console.log('Failed to prompt LLM:\n', e);
				if (e instanceof Error) return error(500, `Failed to prompt LLM: ${e.message}`);
				return error(500, 'Failed to prompt LLM');
			}
		},
		{
			body: t.Object({
				prompt: t.String()
			})
		}
	)
	.post(
		'/prompt-with-knowledge',
		async ({ body, error }) => {
			console.log('Question from user:', body.prompt);
			try {
				const res = await promptLLMWithKnowledgeBase(body.prompt);
				return { answer: res };
			} catch (e) {
				console.log('Failed to prompt LLM:\n', e);
				if (e instanceof Error) return error(500, `Failed to prompt LLM: ${e.message}`);
				return error(500, 'Failed to prompt LLM');
			}
		},
		{
			body: t.Object({
				prompt: t.String()
			})
		}
	)
	.post(
		'/chat',
		async ({ body, error }) => {
			console.log('Question from user:', body.prompt);
			try {
				return new Response(await chatLLM(body.prompt), {
					headers: { 'content-type': 'text/event-stream' }
				});
			} catch (e) {
				console.log('Failed to prompt LLM:\n', e);
				if (e instanceof Error) return error(500, `Failed to prompt LLM: ${e.message}`);
				return error(500, 'Failed to prompt LLM');
			}
		},
		{
			body: t.Object({
				prompt: t.String()
			})
		}
	)
	.group('/documents', (app) => {
		return app
			.get('/', async ({ error }) => {
				const client = createQdrantClient();
				try {
					const documents = await client.getCollection(EMBEDDINGS_COLLECTION_NAME);
					return documents;
				} catch (e) {
					console.log('Failed to get documents:\n', e);
					if (e instanceof Error) return error(500, `Failed to get documents: ${e.message}`);
					return error(500, 'Failed to get documents');
				}
			})
			.get('/:id', async ({ params, error }) => {
				const { id } = params;

				try {
					const res = await getPoint(id).then((d) => d?.payload?.content as string | undefined);
					if (!res) {
						return error(404, 'Document not found');
					}
					return { answer: res };
				} catch (e) {
					console.log('Failed to prompt LLM:\n', e);
					if (e instanceof Error) return error(500, `Failed to prompt LLM: ${e.message}`);
					return error(500, 'Failed to prompt LLM');
				}
			})
			.post(
				'/:id/prompt',
				async ({ body, error, params }) => {
					const { id } = params;
					console.log('Question from user:', body.prompt);
					try {
						const res = await promptLLMWithDocument(body.prompt, id);
						return { answer: res };
					} catch (e) {
						console.log('Failed to prompt LLM:\n', e);
						if (e instanceof Error) return error(500, `Failed to prompt LLM: ${e.message}`);
						return error(500, 'Failed to prompt LLM');
					}
				},
				{
					body: t.Object({
						prompt: t.String()
					})
				}
			)
			.post(
				'/',
				async ({ set, body, error }) => {
					try {
						await insertDocuments([body]);
						console.log(`Inserted document`);
						set.status = 201;
						return { msg: 'Successfully uploaded documents' };
					} catch (e) {
						console.log('Failed to insert document');
						if (e instanceof Error) return error(500, `Failed to insert document: ${e.message}`);
						return error(500, 'Failed to insert document');
					}
				},
				{
					body: DocumentSchema
				}
			)
			.post(
				'/bulk',
				async ({ set, body, error }) => {
					try {
						const store = await insertDocuments(body.documents);
						console.log(`Inserted documents:\n`, store.toJSON());
						set.status = 201;
						return { msg: 'Successfully uploaded documents' };
					} catch (e) {
						console.log('Failed to insert document');
						if (e instanceof Error) return error(500, `Failed to insert document: ${e.message}`);
						return error(500, 'Failed to insert document');
					}
				},
				{
					body: t.Object({
						documents: t.Array(DocumentSchema)
					})
				}
			);
	});

export type API = typeof api;
