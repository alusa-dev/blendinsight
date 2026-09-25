# Blend Insight

Servidor MCP remoto, de uso pessoal, para operar uma conta profissional do Instagram pelo ChatGPT. O projeto usa a API oficial da Meta e mantém os tokens Meta no servidor, cifrados em repouso.

## Estrutura

```text
src/
  app/api/                 Rotas MCP, OAuth, metadados e webhook
  auth/                    Fluxos OAuth, CIMD, PKCE e tokens MCP
  config/                  Validação de configuração
  db/                      Neon/Postgres e repositório de contas
  meta/                    OAuth, DTOs validados, webhook e cliente Graph API
  mcp/                     Servidor, registro, regras e anotações comuns
    tools/                 Ferramentas separadas por domínio
  shared/                  Criptografia e utilitários
drizzle/                   SQL de inicialização do banco
```

## Ferramentas MCP

As ferramentas especializadas incluem leitura de perfil e mídia; insights de conta e mídia; Business Discovery, hashtag search e histórico recente de hashtags; Creator Marketplace para busca e avaliação de criadores, incluindo recomendações, crescimento, atividade recente, dispositivo principal da audiência, conteúdo e informações da marca; permissões de Partnership Ads em nível de conta e publicação (consulta, solicitação, revogação, aprovação de criadores e autorização de promoção), além de gerar ou remover códigos de anúncio dos próprios conteúdos; áudio para Reels, mídia colaborativa, colaboradores e convites de colaboração (Facebook Login); consulta do limite de publicação e status de direitos autorais de vídeos; criação e publicação de imagens, vídeos, Reels, Stories e carrosséis, com user tags, location tags, Trial Reels, rótulos de parceria paga e disclosure de IA; comentários, respostas públicas e privadas, curtidas e exclusão de mídia; leitura e respostas a menções; eventos de lembrete do Instagram (Facebook Login); leitura e envio de mensagens com mídia, coleções de imagens, compartilhamentos, respostas rápidas, modelos de botão/carrossel, respostas a mensagens específicas (Facebook Login), reações, upload de anexos reutilizáveis (Facebook Login com `pages_messaging`), moderação de conversas (bloquear, desbloquear e mover para spam; Facebook Login com `business_management`), indicadores de digitação e leitura; configuração de menu persistente e ice breakers; inscrição em webhooks e leitura/acknowledgement da caixa de eventos. Para contas Business com uma Instagram Shop aprovada, também há elegibilidade, catálogos, busca de produtos e leitura/edição de product tags. As ferramentas genéricas de leitura e escrita cobrem outros endpoints oficiais do Graph API que o token e o app Meta autorizarem.

## Cobertura e limites da API

O MCP expõe operações especializadas para os fluxos de trabalho comuns de uma conta profissional e ferramentas Graph API genéricas para endpoints oficiais adicionais. O Graph API não reproduz todos os recursos do aplicativo Instagram: cada operação depende do tipo Business/Creator, do fluxo Instagram Login ou Facebook Login, das permissões realmente aprovadas, do nível de acesso do app e das limitações da Meta. Curtidas via API, exclusão de mídia, áudio para Reels, Business Discovery, busca por hashtags e mídia colaborativa exigem Facebook Login; algumas também exigem permissões Meta adicionais e acesso aprovado. Business Discovery não retorna contas com restrição etária. Respostas privadas a comentários seguem a janela e o limite definidos pela Meta. Instagram Sharing to Stories é uma integração de apps iOS/Android que abre o compositor do Instagram; não é uma ação remota do servidor MCP. Product tagging exige uma Instagram Shop Business elegível e permissões revisadas; não funciona para Creator, Stories ou Live. Creator Marketplace exige Facebook Login, uma marca elegível ou onboarded, `instagram_creator_marketplace_discovery` com Advanced Access e permissões de negócio; brand info também exige `ads_management`. Partnership Ads e Marketing API exigem permissões, revisão, elegibilidade e ativos de negócio específicos; os escopos opcionais estão desligados por padrão.

Ferramentas que publicam, enviam mensagens, respondem a menções, alteram configurações de mensagens, criam ou alteram eventos, alteram comentários ou removem conteúdo são anotadas como alterações. O ChatGPT deve confirmar a ação concreta antes de executá-las. A etiqueta `HUMAN_AGENT` só deve ser usada para atendimento humano sobre uma solicitação que não pôde ser resolvida na janela padrão de 24 horas, dentro de sete dias da mensagem da pessoa e depois de o app receber aprovação da Meta para o recurso; ela não pode ser usada para automação ou conteúdo promocional. No fluxo Facebook Login, as ferramentas de mensagens exigem `pages_messaging`. O endpoint MCP é stateless Streamable HTTP em `/mcp`.

## Desenvolvimento local

Requisitos: Node.js 22 ou superior e npm.

1. Adicione as variáveis de `.env.example` ao `.env.local` sem substituir as credenciais já existentes. Use um branch Neon de desenvolvimento e sua URL pooled em `DATABASE_URL`. Em desenvolvimento, o cliente bloqueia conexão se `NEON_BRANCH=production`.
2. Gere uma chave de cifra com `npm run db:generate-encryption-key` e configure o resultado em `TOKEN_ENCRYPTION_KEY`. Guarde a mesma chave em um gerenciador de segredos; perder ou trocar a chave impede decifrar os tokens Meta já armazenados.
3. Para aplicar a estrutura do banco, defina explicitamente `MIGRATION_DATABASE_URL` com a URL direta do branch de desenvolvimento e execute `npm run db:migrate`. O script não usa `DATABASE_URL` como fallback; confira que ambas as URLs apontam ao branch de desenvolvimento antes de migrar. Não execute migrações contra o branch `production` nesta etapa.
4. Execute `npm install` e `npm run dev`.

As integrações OAuth precisam de URLs HTTPS públicas. Para desenvolvimento, use um túnel HTTPS e defina `MCP_PUBLIC_URL` como a origem pública desse túnel. Cadastre na Meta exatamente estes URLs de redirecionamento:

```text
https://SEU_HOST/oauth/meta/instagram/callback
https://SEU_HOST/oauth/meta/facebook/callback
```

O callback do Instagram é necessário para **Instagram Login**. O callback do Facebook é necessário para **Facebook Login for Business**; esse fluxo usa contas profissionais do Instagram ligadas a uma Página. O retorno da Meta chega no fragmento do navegador e é encaminhado ao mesmo servidor por um POST protegido, sem passar pela URL de redirecionamento do ChatGPT. No painel Meta, habilite Facebook Login for Business e cadastre exatamente a URL de callback. Instagram Login pode ser usado sem Página. Configure ambos somente se pretende oferecer os dois métodos.

Para receber eventos em tempo real, configure o produto Webhooks no painel da Meta com callback `https://SEU_HOST/webhooks/meta`, o mesmo verify token de `META_WEBHOOK_VERIFY_TOKEN` e os campos de evento apropriados. Depois, inscreva a conta usando `instagram_webhooks_subscribe`. São duas configurações distintas: campos no app Meta e inscrição da conta. Em Facebook Login, a conta também precisa conceder `pages_manage_metadata`. Use `instagram_webhook_events_list` para consultar eventos recebidos; o payload fica cifrado e eventos com mais de 90 dias são eliminados. No fluxo Instagram Login, eventos de menções compatíveis chegam pelo campo `comments`; o campo independente `mentions` é exclusivo do Facebook Login. `messaging_optins` é exclusivo do Instagram Login. `story_insights` não é entregue no fluxo Instagram Login. A entrega para pessoas sem papel no app depende do modo do app e do acesso/revisão da Meta.

## Variáveis de ambiente

- `MCP_PUBLIC_URL`: origem canônica, sem caminho. Em produção deve usar HTTPS.
- `DATABASE_URL`: conexão runtime pooled do branch de desenvolvimento/produção correspondente.
- `MIGRATION_DATABASE_URL`: conexão separada usada exclusivamente pelo script de migração.
- `TOKEN_ENCRYPTION_KEY`: chave base64 de 32 bytes para AES-256-GCM.
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`: credenciais de Instagram Login.
- `META_APP_ID`, `META_APP_SECRET`: credenciais Meta usadas pelo Facebook Login e assinatura de webhooks.
- `META_WEBHOOK_VERIFY_TOKEN`: segredo aleatório configurado também na Meta.
- `META_GRAPH_VERSION`: versão do Graph API, atualmente `v26.0`.
- `INSTAGRAM_LOGIN_SCOPES`, `FACEBOOK_LOGIN_SCOPES`: opcionais; os padrões estão em `.env.example`. Facebook Login inclui permissões para webhooks, curtidas e exclusão de mídia; habilite no painel Meta apenas as permissões necessárias e disponíveis para o app. A Meta pode exigir revisão e Advanced Access para uso fora de contas/pessoas com função no app.
- `FACEBOOK_LOGIN_OPTIONAL_SCOPES`: vazio por padrão. Permite solicitar permissões opcionais aprovadas para product tagging, Creator Marketplace ou Partnership Ads. Ative somente depois que o app Meta tiver o produto, ativos e acesso necessários; alguns usos exigem empresa verificada e Advanced Access.

Não adicione `.env.local`, credenciais, tokens ou `.vercel/` ao Git. O schema guarda tokens cifrados e hashes de tokens OAuth MCP; o webhook valida HMAC, cifra os eventos armazenados e remove o inbox após 90 dias.

## ChatGPT

Depois de publicar e configurar OAuth, crie um aplicativo/conector MCP nas configurações do ChatGPT e use:

```text
https://SEU_HOST/mcp
```

O servidor publica Protected Resource Metadata e Authorization Server Metadata, usa OAuth 2.1 Authorization Code com PKCE S256 e aceita CIMD do domínio `chatgpt.com`. Durante a autorização, escolha Instagram Login ou Facebook Login e conclua o consentimento da Meta.

## Vercel e isolamento

O projeto remoto exclusivo desta aplicação é `blend-insight` (`prj_mEuT7Itw8xm4mx2dzeigy2B2NeF8`), na equipe Alusa. Esta pasta local aponta para ele em `.vercel/project.json`, arquivo ignorado pelo Git. Isso seleciona o projeto para comandos Vercel executados nesta pasta; não configura outro projeto, domínio, integração Git ou deployment.

Quando chegar a hora de publicar, configure variáveis e domínio dentro do projeto Vercel `blend-insight` e conecte somente o repositório `alusa-dev/blendinsight`. Os deploys desse projeto ficam isolados dos projetos `alusa-web` e `alusa-admin`. Uma dependência compartilhada, como apontar ambos os projetos para o mesmo branch Neon, ainda pode compartilhar dados; mantenha branches e credenciais separados por ambiente. Ainda não há deploy nem domínio neste projeto.

## Endpoints

| Caminho | Uso |
| --- | --- |
| `/mcp` | Streamable HTTP MCP |
| `/.well-known/oauth-protected-resource` | Metadados do recurso OAuth |
| `/.well-known/oauth-authorization-server` | Metadados do servidor OAuth |
| `/oauth/authorize`, `/oauth/token` | OAuth do ChatGPT |
| `/oauth/meta/instagram/callback` | Callback Instagram Login |
| `/oauth/meta/facebook/callback` | Callback Facebook Login |
| `/webhooks/meta` | Verificação, validação HMAC e inbox cifrado para webhooks Meta |

## Referências oficiais

- Meta: [Instagram Platform e visão geral](https://developers.facebook.com/documentation/instagram-platform/overview/), [Instagram API Changelog](https://developers.facebook.com/documentation/instagram-platform/changelog/), [Content Publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing/), [Instagram Audio API](https://developers.facebook.com/documentation/instagram-platform/content-publishing/audio-api/), [Comment Moderation](https://developers.facebook.com/documentation/instagram-platform/comment-moderation/), [Private Replies](https://developers.facebook.com/documentation/instagram-platform/private-replies/), [Insights](https://developers.facebook.com/documentation/instagram-platform/insights/), [Business Discovery](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-discovery/), [Creator Marketplace](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/creator-marketplace/), [Partnership Ads](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/partnership-ads/), [Permissões de Partnership Ads em nível de publicação](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/partnership-ads/post-level-permissioning/), [Códigos de Partnership Ads](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/partnership-ads/ad-codes/), [Copyright Detection](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/copyright-detection/), [Product Tagging](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/product-tagging/), [Hashtag Search](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/hashtag-search/), [Mentions](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/mentions/), [Upcoming Events](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/upcoming-events/), [Collaboration Invites](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/collaboration-invites/), [Messaging com Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/), [Templates de mensagem](https://developers.facebook.com/docs/instagram-messaging/generic-template), [Menu persistente](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/persistent-menu/), [Ice breakers](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/ice-breakers/), [Human Agent](https://developers.facebook.com/docs/features-reference/human-agent/), [Envio e respostas de mensagem](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/send-message), [Upload de anexos reutilizáveis](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/attachment-upload), [Moderação de conversas](https://developers.facebook.com/docs/messenger-platform/instagram/features/moderate-conversations/), [Webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks/), [oEmbed](https://developers.facebook.com/documentation/instagram-platform/oembed/).
- OpenAI: [MCP server para ChatGPT](https://developers.openai.com/plugins/build/mcp-server), [OAuth para conectores](https://developers.openai.com/plugins/build/auth).
- MCP TypeScript SDK: [documentação do SDK](https://github.com/modelcontextprotocol/typescript-sdk).
