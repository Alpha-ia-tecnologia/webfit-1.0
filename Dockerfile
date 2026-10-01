# WebFit online: servidor Express + build do app web (ver docs/guias/publicacao-vps.md).
# O servidor roda o TypeScript com tsx e importa o vite, por isso a imagem leva todas as dependências.
FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

COPY . .
RUN node node_modules/vite/bin/vite.js build

# Sem root dentro do contêiner; o código continua do root (o app não consegue alterá-lo).
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "server/index.ts", "--production"]
