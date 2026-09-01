// Shared TypeScript types for the frontend
// Add types here (User, ApiResponse, etc.)

export interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt?: string;
}

export interface HealthData {
  api: string;
  database: string;
  timestamp: string;
  environment: string;
}
