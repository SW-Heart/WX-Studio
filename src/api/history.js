import { API_BASE_URL } from '../config/app';

export const fetchUserHistory = async (token) => {
  const res = await fetch(`${API_BASE_URL}/api/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch history: ${res.status}`);
  }
  return res.json();
};

export const deleteUserHistoryItem = async (token, itemId) => {
  const res = await fetch(`${API_BASE_URL}/api/history/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete history item: ${res.status}`);
  }
  return res.json();
};

