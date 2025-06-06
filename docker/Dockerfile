# Stage 1: Install dependencies
FROM node:23-slim AS dependencies

# Maintainer information
LABEL org.opencontainers.image.authors="Tan Jin (tjtanjin)"

# Set the working directory
WORKDIR /app

# Copy package.json to the container
COPY ./package.json ./

# Install the dependencies
RUN npm install

# Stage 2: Build the application
FROM node:23-slim AS build

# Set the working directory
WORKDIR /app

# Copy installed dependencies from the previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy specific necessary files and directories
COPY ./src ./src
COPY ./tsconfig.json ./
COPY ./package.json ./

# Build application code
RUN npm run build

# Stage 3: Create the final image
FROM node:23-slim

# Set the working directory inside the container
WORKDIR /app

# Copy built application code from the build stage
COPY --from=build /app/build ./build

# Copy node_modules directory from the build stage
COPY --from=build /app/node_modules ./node_modules

# Copy additional files needed for runtime
COPY package.json ./

# Expose service on port 8080
EXPOSE 8080

# Start the application
CMD ["node", "./build/index.js"]