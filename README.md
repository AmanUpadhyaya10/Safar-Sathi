# 🚌 Safar Sathi - Real-Time Bus Tracking System

A comprehensive real-time bus tracking and fleet management system built with Node.js, React, and PostgreSQL. Safar Sathi provides live bus tracking, route planning, fleet analytics, and passenger information services.

## ✨ Features

### 🎯 Core Features
- **Real-time Bus Tracking**: Live GPS tracking of buses with WebSocket connections
- **Interactive Dashboard**: Modern React-based dashboard with real-time updates
- **Route Management**: Complete route planning and bus stop management
- **Fleet Analytics**: Performance metrics and operational insights
- **Journey Planning**: Trip planning with ETA calculations
- **Live Map Integration**: Visual representation of bus locations and routes
- **Driver Management**: Driver assignment and tracking
- **Passenger Counting**: Real-time passenger load monitoring

### 🛠️ Technical Features
- **Real-time Communication**: Socket.IO for live updates
- **Caching Layer**: Redis for high-performance data caching
- **Geospatial Database**: PostgreSQL with PostGIS for location data
- **Authentication**: JWT-based secure authentication
- **API Rate Limiting**: Built-in protection against abuse
- **Docker Support**: Complete containerization for easy deployment
- **Health Monitoring**: Comprehensive health checks and logging

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Database      │
│   (React)       │◄──►│   (Node.js)     │◄──►│   (PostgreSQL)  │
│   Port: 3000    │    │   Port: 5000    │    │   Port: 5432    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         └──────────────►│   Redis Cache   │◄─────────────┘
                        │   Port: 6379    │
                        └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm 8+
- PostgreSQL 13+ with PostGIS extension
- Redis 6+
- Docker and Docker Compose (optional)

### Option 1: Docker Setup (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd safar-sathi
   ```

2. **Start all services with Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Access the application**
   - Frontend Dashboard: http://localhost:3000
   - Backend API: http://localhost:5000
   - API Health Check: http://localhost:5000/health

### Option 2: Manual Setup

1. **Install dependencies**
   ```bash
   # Install backend dependencies
   npm install
   
   # Install frontend dependencies
   cd "Bus Tracking Dashboard"
   npm install
   cd ..
   ```

2. **Set up the database**
   ```bash
   # Create PostgreSQL database with PostGIS
   createdb safar_sathi
   psql safar_sathi -c "CREATE EXTENSION postgis;"
   
   # Run migrations
   npm run migrate
   
   # Seed sample data
   npm run seed
   ```

3. **Configure environment**
   ```bash
   cp env.example .env
   # Edit .env with your database and Redis credentials
   ```

4. **Start the services**
   ```bash
   # Start backend
   npm start
   
   # In another terminal, start frontend
   npm run dev:frontend
   ```

## 📁 Project Structure

```
safar-sathi/
├── 📁 Bus Tracking Dashboard/     # React frontend application
│   ├── 📁 src/
│   │   ├── 📁 components/         # React components
│   │   ├── 📁 services/          # API and socket services
│   │   └── 📁 styles/            # CSS and styling
│   └── 📄 package.json
├── 📁 config/                    # Configuration files
│   └── 📄 redis.js              # Redis configuration
├── 📁 middleware/                # Express middleware
│   └── 📄 auth.js               # Authentication middleware
├── 📁 routes/                    # API route handlers
│   ├── 📄 auth.js               # Authentication routes
│   ├── 📄 vehicles.js           # Vehicle management
│   ├── 📄 trips.js              # Trip management
│   ├── 📄 routes.js             # Route management
│   └── 📄 drivers.js            # Driver management
├── 📁 sockets/                   # Socket.IO handlers
│   └── 📄 locationSocket.js     # Real-time location updates
├── 📁 migrations/                # Database migrations
│   └── 📄 001_initial_schema.sql
├── 📁 scripts/                   # Utility scripts
│   ├── 📄 migrate.js            # Database migration runner
│   └── 📄 seed.js               # Sample data seeder
├── 📁 utils/                     # Utility functions
│   └── 📄 logger.js             # Logging configuration
├── 📄 app.js                     # Main application entry point
├── 📄 docker-compose.yml         # Docker services configuration
└── 📄 package.json              # Backend dependencies
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/safar_sathi
DB_HOST=localhost
DB_PORT=5432
DB_NAME=safar_sathi
DB_USER=username
DB_PASSWORD=password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=logs/combined.log
ERROR_LOG_FILE=logs/error.log
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh JWT token

### Vehicles
- `GET /api/vehicles` - Get all vehicles
- `GET /api/vehicles/:id` - Get vehicle by ID
- `POST /api/vehicles` - Create new vehicle
- `PUT /api/vehicles/:id` - Update vehicle
- `DELETE /api/vehicles/:id` - Delete vehicle

### Trips
- `GET /api/trips` - Get all trips
- `GET /api/trips/:id` - Get trip by ID
- `POST /api/trips` - Create new trip
- `PUT /api/trips/:id` - Update trip status

### Routes
- `GET /api/routes` - Get all routes
- `GET /api/routes/:id` - Get route by ID
- `POST /api/routes` - Create new route

### Real-time Data
- `GET /api/realtime/vehicles/:id/location` - Get cached vehicle location
- `GET /api/realtime/trips/:id/etas` - Get trip ETAs

### Health Check
- `GET /health` - System health status

## 🔌 WebSocket Events

### Client → Server
- `join_vehicle_tracking` - Join vehicle tracking room
- `leave_vehicle_tracking` - Leave vehicle tracking room
- `request_location_update` - Request location update

### Server → Client
- `vehicle_location_update` - Real-time vehicle location
- `eta_update` - ETA updates for stops
- `trip_status_change` - Trip status changes
- `alert` - System alerts and notifications

## 🗄️ Database Schema

The system uses PostgreSQL with PostGIS for geospatial data:

- **users** - User accounts and authentication
- **drivers** - Driver information and ratings
- **vehicles** - Bus/vehicle details and assignments
- **routes** - Bus routes and configurations
- **bus_stops** - Stop locations with geospatial data
- **trips** - Trip instances and status
- **vehicle_locations** - Real-time GPS tracking data
- **trip_stops** - Stop visit records
- **alerts** - System notifications

## 🚀 Deployment

### Production Deployment

1. **Set up production environment variables**
   ```bash
   NODE_ENV=production
   DATABASE_URL=postgresql://user:pass@prod-db:5432/safar_sathi
   REDIS_HOST=prod-redis
   JWT_SECRET=your-production-secret
   ```

2. **Build and deploy with Docker**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Set up reverse proxy (Nginx)**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
       }
       
       location /api {
           proxy_pass http://localhost:5000;
       }
       
       location /socket.io/ {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

## 🧪 Development

### Available Scripts

```bash
# Backend
npm start              # Start production server
npm run dev           # Start development server with nodemon
npm run migrate       # Run database migrations
npm run seed          # Seed sample data

# Frontend
npm run dev:frontend  # Start frontend development server
npm run build:frontend # Build frontend for production

# Full setup
npm run setup         # Install all dependencies and setup database
```

### Development Workflow

1. **Backend Development**
   ```bash
   npm run dev
   # Server runs on http://localhost:5000
   ```

2. **Frontend Development**
   ```bash
   npm run dev:frontend
   # Frontend runs on http://localhost:5173
   ```

3. **Database Changes**
   ```bash
   # Create new migration
   # Edit migrations/002_new_feature.sql
   npm run migrate
   ```

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: API rate limiting to prevent abuse
- **CORS Protection**: Configurable CORS policies
- **Input Validation**: Joi-based request validation
- **SQL Injection Prevention**: Parameterized queries
- **Helmet.js**: Security headers and CSP

## 📈 Monitoring & Logging

- **Winston Logger**: Structured logging with multiple levels
- **Health Checks**: Comprehensive system health monitoring
- **Error Tracking**: Centralized error logging and tracking
- **Performance Metrics**: Built-in performance monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation in `/docs` folder

## 🔮 Roadmap

- [ ] Mobile app (React Native)
- [ ] Advanced analytics dashboard
- [ ] Machine learning for ETA prediction
- [ ] Integration with payment systems
- [ ] Multi-language support
- [ ] Advanced reporting features

---

**Safar Sathi** - Making public transportation smarter and more accessible! 🚌✨
