FROM node:22-bookworm-slim

USER node
RUN mkdir /home/node/app
WORKDIR /home/node/app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node index.html style.css tsconfig.json vite.config.ts ./
COPY --chown=node:node src ./src

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
