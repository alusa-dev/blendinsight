import { getEnv } from "@/config/env";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const endpoint = new URL("/mcp", getEnv().MCP_PUBLIC_URL).toString();
  return (
    <main style={{ maxWidth: 760, margin: "12vh auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#20242b" }}>
      <p style={{ color: "#596579", fontSize: 14, letterSpacing: ".08em", textTransform: "uppercase" }}>Blend Studio</p>
      <h1>Blend Insight</h1>
      <p>Servidor MCP pessoal para conectar o Instagram profissional ao ChatGPT.</p>
      <p>Endpoint MCP: <code>{endpoint}</code></p>
      <p>Conecte este servidor como um aplicativo MCP nas configurações do ChatGPT.</p>
      <nav aria-label="Informações do serviço" style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 40, fontSize: 14 }}>
        <a href="/privacy">Política de Privacidade</a>
        <a href="/terms">Termos de Serviço</a>
        <a href="/data-deletion">Exclusão de dados</a>
        <a href="/support">Suporte</a>
      </nav>
    </main>
  );
}
