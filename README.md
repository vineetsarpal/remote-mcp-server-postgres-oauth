

# MCP Server for PostgreSQL with GitHub OAuth

This project is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server deployed on Cloudflare Workers, providing secure read and write access to a PostgreSQL database. Authentication is enforced via GitHub OAuth, ensuring only authorized users can perform sensitive operations.

## Features

- **GitHub OAuth Authentication:** All users must sign in with GitHub to access the server.
- **Read Operations:** Any authenticated GitHub user can list tables and run read-only SQL queries (`SELECT`).
- **Write Operations:** Only specific GitHub usernames (listed in `ALLOWED_USERNAMES` in the code) can perform write operations (`INSERT`, `UPDATE`, `DELETE`).
- **Cloudflare Workers Deployment:** Easily deploy and scale using Cloudflare infrastructure.
- **Secure Token and State Management:** Uses KV storage for secure handling of authentication state and tokens.

## Tools Provided

- **listTables:** Lists all tables and columns in the database. Available to all authenticated users.
- **queryDatabase:** Executes read-only SQL queries. Only allows `SELECT` and similar operations. Available to all authenticated users.
- **executeDatabase:** Executes any SQL statement, including write operations. Restricted to privileged GitHub users.

## Getting Started

1. **Clone and Install:**
   ```bash
   git clone https://github.com/vineetsarpal/remote-mcp-server-postgres-oauth.git
   cd remote-mcp-server-postgres-oauth
   npm install
   ```

2. **Set Up GitHub OAuth:**
   - Create a GitHub OAuth App.
   - Set the Homepage URL and Callback URL to your worker domain (e.g., `https://your-worker.<subdomain>.workers.dev`).
   - Store your Client ID and Secret using Wrangler:
     ```bash
     wrangler secret put GITHUB_CLIENT_ID
     wrangler secret put GITHUB_CLIENT_SECRET
     wrangler secret put COOKIE_ENCRYPTION_KEY # e.g., openssl rand -hex 16
     ```
   - Configure KV Namespace:
     ```bash
     wrangler kv namespace create "OAUTH_KV"
     ```
   - Add the namespace ID to your Wrangler configuration file.

3. **Set Up PostgreSQL Database:**
   - Obtain the connection string for your PostgreSQL database (e.g., `postgresql://user:password@host:port/dbname`).
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

Replace the content with the following configuration. Once you restart Claude Desktop, a browser window will open showing your OAuth login page. Complete the authentication flow to grant Claude access to your MCP server. After you grant access, the tools will become available for you to use.

```
{
  "mcpServers": {
    "math": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp-github-oauth.<your-subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```
Once the Tools show up in the interface, you can ask Claude to interact with your database

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
   DATABASE_URL=postgresql://user:password@host:port/dbname
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