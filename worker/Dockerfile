# Use the official Node.js image as the base image
FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy the package.json and pnpm-lock.yaml files to the container
COPY package.json pnpm-lock.yaml ./

# Install the dependencies using pnpm
RUN pnpm install

# Copy the rest of the application code to the container
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the application
CMD ["pnpm", "start"]
