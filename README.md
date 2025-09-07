🚌 Safar Sathi - Public Transport Tracking System
A comprehensive real-time public transport tracking system built with Node.js, Express, Socket.IO, PostgreSQL, and Redis.

✨ Features
Real-time bus tracking with GPS coordinates
Driver mobile app (PWA) for location streaming
Passenger web app with live maps and ETAs
Admin dashboard for fleet management
JWT authentication with role-based access
Redis caching and pub/sub for scalability
PostGIS for geospatial queries
Docker support for easy deployment
🏗️ Architecture
Frontend (React + Leaflet) ← → Backend (Node.js + Express)
                                     ↓
                              Socket.IO (Real-time)
                                     ↓
                              Redis (Cache/Pub-Sub)
                                     ↓
                              PostgreSQL + PostGIS
🚀 Quick Start
Prerequisites
Node.js 18+ and npm
PostgreSQL 13+ with PostGIS extension
Redis 6+
Docker & Docker Compose (optional)
Option 1: Docker Setup (Recommended)
Clone and setup
bash
git clone <repository-url>
cd safar-sathi-backend
cp .env.example .env
Edit environment variables
bash
# Edit .env with your configuration
nano .env
Start with Docker Compose
bash
docker-compose up -d
Run migrations and seed data
bash
# Wait for containers to be ready, then:
docker-compose exec backend npm run migrate
docker-compose exec backend npm run seed
Access the application
Backend API: http://localhost:5000
Health Check: http://localhost:5000/health
Database: localhost:5432
Redis: localhost:6379
Option 2: Manual Setup
Install dependencies
bash
npm install
Setup PostgreSQL database
sql
-- Create database and user
CREATE DATABASE safar_sathi;
CREATE USER safar_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE safar_sathi TO safar_user;

-- Enable PostGIS extension
\c safar_sathi
CREATE EXTENSION postgis;
Setup Redis
bash
# Install Redis (Ubuntu/Debian)
sudo apt install redis-server
sudo systemctl start redis-server
Configure environment
bash
cp .env.example .env
# Edit .env with your database and Redis credentials
Run migrations and seed data
bash
npm run migrate
npm run seed
Start the server
bash
npm run dev  # Development
npm start    # Production
📁 Project Structure
safar-sathi-backend/
├── middleware/
│   └── auth.js              # JWT authentication & validation
├── routes/
│   ├── auth.js              # Authentication endpoints
│   ├── vehicles.js          # Vehicle management
│   ├── trips.js             # Trip management
│   └── drivers.js           # Driver management
├── sockets/
│   └── locationSocket.js    # Real-time location handling
├── config/
│   └── redis.js             # Redis configuration
├── utils/
│   └── logger.js            # Winston logging
├── scripts/
│   ├── migrate.js           # Database migration script
│   └── seed.js              # Database seeding script
├── migrations/
│   └── 001_initial_schema.sql
├── logs/                    # Log files
├── app.js                   # Main application
├── package.json
├── Dockerfile
└── docker-compose.yml
🔐 Authentication
Default Users (after seeding):
Admin: admin@safarsathi.com / admin123
Driver 1: driver1@safarsathi.com / driver123
Driver 2: driver2@safarsathi.com / driver123
API Authentication:
bash
# Login
curl -X POST http://localhost:5
