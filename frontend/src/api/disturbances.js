import axios from 'axios';

const API_BASE = '/api/v1'; // Matches backend/config/urls.py path structure

export const uploadDisturbance = async (formData) => {
  try {
    const response = await axios.post(`${API_BASE}/disturbances/upload/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Calculates SHA-256 hash of a file locally for pre-upload validation
 */
export const calculateLocalHash = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};
