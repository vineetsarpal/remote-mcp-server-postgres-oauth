import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { GitHubHandler } from "./github-handler";
import { formatDatabaseError, validateSqlQuery, isWriteOperation, closeDb, withDatabase } from "./database";

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
type Props = {
	login: string;
	name: string;
	email: string;
	accessToken: string;
};

const ALLOWED_USERNAMES = new Set<string>([
	// Add GitHub usernames of users who should have access to database write operations
	// For example: 'yourusername', 'coworkerusername'
	'vineetsarpal'
]);

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "PostgreSQL Database MCP Server",
		version: "1.0.0",
	});

	/**
	 * Cleanup database connections when Durable Object is shutting down
	 */
	async cleanup(): Promise<void> {
		try {
			await closeDb();
			console.log('Database connections closed successfully');
		} catch (error) {
			console.error('Error during database cleanup:', error);
		}
	}

	/**
	 * Durable Objects alarm handler - used for cleanup
	 */
	async alarm(): Promise<void> {
		await this.cleanup();
	}

	async init() {
		// Tool 1: List Tables - Available to all authenticated users
		this.server.tool(
			"listTables",
			"Get a list of all tables in the database along with their column information. Use this first to understand the database structure before querying.",
			{},
			async () => {
				try {
					return await withDatabase((this.env as any).DATABASE_URL, async (db) => {
						// Single query to get all table and column information (using your working query)
						const columns = await db`
							SELECT 
								table_name, 
								column_name, 
								data_type, 
								is_nullable,
								column_default
							FROM information_schema.columns 
							WHERE table_schema = 'public' 
							ORDER BY table_name, ordinal_position
						`;
						
						// Group columns by table
						const tableMap = new Map();
						for (const col of columns) {
							// Use snake_case property names as returned by the SQL query
							if (!tableMap.has(col.table_name)) {
								tableMap.set(col.table_name, {
									name: col.table_name,
									schema: 'public',
									columns: []
								});
							}
							tableMap.get(col.table_name).columns.push({
								name: col.column_name,
								type: col.data_type,
								nullable: col.is_nullable === 'YES',
								default: col.column_default
							});
						}
						
						const tableInfo = Array.from(tableMap.values());
						
						return {
							content: [
								{
									type: "text",
									text: `**Database Tables and Schema**\n\n${JSON.stringify(tableInfo, null, 2)}\n\n**Total tables found:** ${tableInfo.length}\n\n**Note:** Use the \`queryDatabase\` tool to run SELECT queries, or \`executeDatabase\` tool for write operations (if you have write access).`
								}
							]
						};
					});
				} catch (error) {
					console.error('listTables error:', error);
					return {
						content: [
							{
								type: "text",
								text: `Error retrieving database schema: ${formatDatabaseError(error)}`,
								isError: true
							}
						]
					};
				}
			}
		);

		// Tool 2: Query Database - Available to all authenticated users (read-only)
		this.server.tool(
			"queryDatabase",
			"Execute a read-only SQL query against the PostgreSQL database. This tool only allows SELECT statements and other read operations. All authenticated users can use this tool.",
			{
				sql: z.string().describe("The SQL query to execute. Only SELECT statements and read operations are allowed.")
			},
			async ({ sql }) => {
				try {
					// Validate the SQL query
					const validation = validateSqlQuery(sql);
					if (!validation.isValid) {
						return {
							content: [
								{
									type: "text",
									text: `Invalid SQL query: ${validation.error}`,
									isError: true
								}
							]
						};
					}
					
					// Check if it's a write operation
					if (isWriteOperation(sql)) {
						return {
							content: [
								{
									type: "text",
									text: "Write operations are not allowed with this tool. Use the `executeDatabase` tool if you have write permissions (requires special GitHub username access).",
									isError: true
								}
							]
						};
					}
					
					return await withDatabase((this.env as any).DATABASE_URL, async (db) => {
						const results = await db.unsafe(sql);
						
						return {
							content: [
								{
									type: "text",
									text: `**Query Results**\n\`\`\`sql\n${sql}\n\`\`\`\n\n**Results:**\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n\n**Rows returned:** ${Array.isArray(results) ? results.length : 1}`
								}
							]
						};
					});
				} catch (error) {
					console.error('queryDatabase error:', error);
					return {
						content: [
							{
								type: "text",
								text: `Database query error: ${formatDatabaseError(error)}`,
								isError: true
							}
						]
					};
				}
			}
		);

		// Tool 3: Execute Database - Only available to privileged users (write operations)
		if (ALLOWED_USERNAMES.has(this.props.login)) {
			this.server.tool(
				"executeDatabase",
				"Execute any SQL statement against the PostgreSQL database, including INSERT, UPDATE, DELETE, and DDL operations. This tool is restricted to specific GitHub users and can perform write transactions. **USE WITH CAUTION** - this can modify or delete data.",
				{
					sql: z.string().describe("The SQL statement to execute. Can be any valid SQL including INSERT, UPDATE, DELETE, CREATE, etc.")
				},
				async ({ sql }) => {
					try {
						// Validate the SQL query
						const validation = validateSqlQuery(sql);
						if (!validation.isValid) {
							return {
								content: [
									{
										type: "text",
										text: `Invalid SQL statement: ${validation.error}`,
										isError: true
									}
								]
							};
						}
						
						return await withDatabase((this.env as any).DATABASE_URL, async (db) => {
							const results = await db.unsafe(sql);
							
							const isWrite = isWriteOperation(sql);
							const operationType = isWrite ? "Write Operation" : "Read Operation";
							
							return {
								content: [
									{
										type: "text",
										text: `**${operationType} Executed Successfully**\n\`\`\`sql\n${sql}\n\`\`\`\n\n**Results:**\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n\n${isWrite ? '**⚠️ Database was modified**' : `**Rows returned:** ${Array.isArray(results) ? results.length : 1}`}\n\n**Executed by:** ${this.props.login} (${this.props.name})`
									}
								]
							};
						});
					} catch (error) {
						console.error('executeDatabase error:', error);
						return {
							content: [
								{
									type: "text",
									text: `Database execution error: ${formatDatabaseError(error)}`,
									isError: true
								}
							]
						};
					}
				}
			);
		}
	}
}

export default new OAuthProvider({
	apiHandlers: {
		'/sse': MyMCP.serveSSE('/sse') as any,
		'/mcp': MyMCP.serve('/mcp') as any,
	},
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GitHubHandler as any,
	tokenEndpoint: "/token",
});