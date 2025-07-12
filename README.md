

# MCP Server for PostgreSQL with GitHub OAuth

![Node.js](https://img.shields.io/badge/Node.js-v18+-green)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)

This [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server allows to interact with a PostgreSQL database through a secure, scalable, and easy-to-deploy interface. Built on Cloudflare Workers, it enables:

- **Conversational Database Access**: Query your PostgreSQL database using natural language or SQL via MCP-compatible clients like Claude Desktop
- **Secure Authentication and Authorization**: Enforce GitHub OAuth to ensure only authorized users can access read and write operations
- **Serverless Deployment**: Run as a lightweight, scalable Cloudflare Worker, perfect for remote MCP server setups

## Features

- **GitHub OAuth Authentication:** All users must sign in with GitHub to access the server.
- **Read Operations:** Any authenticated GitHub user can list tables and run read-only SQL queries (`SELECT`).
- **Write Operations:** Only specific GitHub usernames (listed in `ALLOWED_USERNAMES` in the code) can perform write operations (`INSERT`, `UPDATE`, `DELETE`).
- **Cloudflare Workers Deployment:** Easily deploy and scale using Cloudflare's serverless infrastructure.
- **Secure Token and State Management:** Uses Cloudflare KV storage for secure handling of authentication state and tokens.

## Tools Provided

This server exposes the following Model Context Protocol (MCP) tools:

- **listTables:** Lists all tables and columns in the database. Available to all authenticated users.
- **queryDatabase:** Executes read-only SQL queries. Only allows `SELECT` and similar operations. Available to all authenticated users.
- **executeDatabase:** Executes any SQL statement, including write operations. Restricted to privileged GitHub users.

## Architecture

```mermaid
graph LR
    A[Client: Claude Desktop] -->|MCP Endpoint| B[Cloudflare Worker]
    B -->|GitHub OAuth| C[Authentication]
    B -->|PostgreSQL Queries| D[PostgreSQL Database]
    B -->|KV Storage| E[Cloudflare KV]
```

## Getting Started

1. **Clone and Install:**
   ```bash
   git clone https://github.com/vineetsarpal/remote-mcp-server-postgres-oauth.git
   cd remote-mcp-server-postgres-oauth
   npm install
   ```

2. **Set Up GitHub OAuth:**
   - Create a GitHub OAuth App.
   - Set the Homepage URL and Callback URL to your worker domain (e.g., `https://<your-worker>.<your-subdomain>.workers.dev`).
   - Store your Client ID and Secret using Wrangler:
     ```bash
     wrangler secret put GITHUB_CLIENT_ID
     wrangler secret put GITHUB_CLIENT_SECRET
     wrangler secret put COOKIE_ENCRYPTION_KEY # Get by runnning 'openssl rand -hex 32'
     ```
   - Configure KV Namespace:
     ```bash
     wrangler kv namespace create "OAUTH_KV"
     ```
   - Add the namespace ID to your Wrangler configuration file.

3. **Set Up PostgreSQL Database:**
   - Obtain the connection string for your PostgreSQL database (e.g., `postgresql://username:password@host:port/db_name`).
   - Store the database URL using Wrangler:
     ```bash
     wrangler secret put DATABASE_URL
     ```

4. **Deploy:**
   Deploy your application using:
   ```bash
   wrangler deploy
   ```

## Access the remote MCP server from Claude Desktop

To integrate this MCP server with Claude Desktop, follow these steps:  

Open Claude Desktop and navigate to Settings -> Developer -> Edit Config. This opens the configuration file that controls which MCP servers Claude can access.

Add the following configuration:
```
{
  "mcpServers": {
    "postgres-oauth": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<your-worker>.<your-subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```
Restart Claude Desktop, a browser window will open showing your OAuth login page. Complete the authentication flow to grant Claude access to your MCP server. After you grant access, the tools must become available for you to use.
Once the Tools show up in the interface, you can ask Claude to interact with your database.

### Example
![Example](images/query-sample.png)

## Access Control

- **Read-Only Access:** Available to all authenticated GitHub users.
- **Write Access:** Restricted to users listed in the `ALLOWED_USERNAMES` set in `index.ts`:
  ```javascript
  const ALLOWED_USERNAMES = new Set([
    'yourusername',
    'teammate1'
  ]);
  ```

## Local Development

1. Create a `.dev.vars` file with your GitHub OAuth credentials and PostgreSQL database URL:
   ```
   GITHUB_CLIENT_ID=your_development_github_client_id
   GITHUB_CLIENT_SECRET=your_development_github_client_secret
   DATABASE_URL=postgresql://username:password@host:port/db_name
   ```
2. Run locally:
   ```bash
   wrangler dev
   ```

## Usage

- Connect with MCP clients (e.g., Inspector, Claude Desktop) using your worker’s `/mcp` endpoint.
- Only privileged users can perform write operations; others are limited to read-only queries.

## How It Works

- **Authentication:** GitHub OAuth secures all endpoints.
- **Authorization:** Write operations are restricted by username.
- **Database Access:** PostgreSQL queries are executed via secure handlers using the `DATABASE_URL` environment variable.
- **Cloudflare Workers:** The server is stateless and scalable.