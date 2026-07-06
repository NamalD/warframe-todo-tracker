# Warframe TODO Tracker

Track Warframe craftable items, required materials, material and part sources, and crafting trees.

## Self-Hosting with Docker

A production-ready Docker image is available for easy self-hosting. The image uses a multi-stage build: Node.js for the Vite build and nginx for serving static files.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed on your system

### Build the image

```bash
git clone https://github.com/NamalD/warframe-todo-tracker.git
cd warframe-todo-tracker
docker build -t warframe-todo-tracker:latest .
```

### Run the container

```bash
docker run -d --name warframe-todos -p 3000:80 warframe-todo-tracker:latest
```

The app will be available at http://localhost:3000.

### Useful commands

```bash
# View logs
docker logs warframe-todos

# Stop the container
docker stop warframe-todos

# Remove the container
docker rm warframe-todos

# Rebuild after pulling latest changes
git pull
docker build -t warframe-todo-tracker:latest .
docker stop warframe-todos && docker rm warframe-todos
docker run -d --name warframe-todos -p 3000:80 warframe-todo-tracker:latest
```

### Troubleshooting

- **Port already in use:** Change `-p 3000:80` to a different host port, e.g. `-p 8080:80`.
- **Container exits immediately:** Check logs with `docker logs warframe-todos`.
