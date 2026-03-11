# Power System Disturbance Analyzer

A web application for analyzing power system disturbances from multiple file formats.

## Project Structure

```text
├── backend/                # Django backend
│   ├── analysis/           # Analysis logic and models
│   ├── config/             # Django settings and configuration
│   ├── core/               # Core application logic
│   ├── data/               # Local data storage (SQLite, etc.)
│   ├── disturbances/       # Disturbance management
│   ├── media/              # Uploaded disturbance files
│   ├── utils/              # Shared utility functions
│   ├── manage.py           # Django management script
│   └── requirements.txt    # Backend dependencies
├── frontend/               # React + Vite frontend
│   ├── public/             # Static assets
│   ├── src/
│   │   ├── api/            # API client and service calls
│   │   ├── assets/         # Images, fonts, etc.
│   │   ├── components/
│   │   │   ├── common/    # Shared UI components
│   │   │   └── features/  # Feature-specific components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── pages/          # Page-level components
│   │   ├── services/       # Frontend business logic
│   │   ├── utils/          # Utility functions
│   │   ├── App.jsx         # Root component
│   │   └── main.jsx        # Entry point
│   ├── package.json        # Frontend dependencies
│   └── vite.config.js      # Vite configuration
└── README.md               # This file
```

## Getting Started

### Backend Setup

1. Navigate to the `backend/` directory.
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run migrations:
   ```bash
   python manage.py migrate
   ```
5. Start the development server:
   ```bash
   python manage.py runserver
   ```

### Frontend Setup

1. Navigate to the `frontend/` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
