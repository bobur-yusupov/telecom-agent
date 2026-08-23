FROM node:20-alpine

WORKDIR /app

# Copy package definition files
COPY package.json package-lock.json tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy application source code
COPY . .

# Run the telecom agent application
CMD ["npm", "run", "start"]
