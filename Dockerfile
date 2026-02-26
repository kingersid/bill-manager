# Build Stage for Frontend
FROM node:20-alpine as build-stage
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Final Stage for Backend
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --production
COPY server/ ./server/
COPY --from=build-stage /app/client/dist ./server/public

EXPOSE 3001
CMD ["node", "server/index.js"]
