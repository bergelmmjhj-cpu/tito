# TimeClock App

This is a simple TimeClock application with a plain HTML/CSS/JS frontend and a Node.js + Express backend.

## Running the Application Locally

### Prerequisites
- Node.js and npm installed.

### Steps
1. Clone the repository.
2. Navigate to the `server` directory.
3. Run `npm install` to install the dependencies.
4. Create a `.env` file based on `.env.example`.
5. Start the server using `npm start`.
6. Open `client/index.html` in your browser to access the frontend.

## API Endpoints
- **GET /**: Returns "TimeClock API running"
- **POST /clock-in**: Accepts `{workerId, hotelName}` to create an open shift.
- **POST /clock-out**: Accepts `{workerId}` to close the open shift.
- **GET /logs/:workerId**: Returns logs for the specified worker.
