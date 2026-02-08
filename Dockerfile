FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Install Playwright browsers
RUN npx playwright install chromium

# Copy source code
COPY . .

# Expose port
EXPOSE 5656

# Start server
CMD ["npm", "run", "serve"]
