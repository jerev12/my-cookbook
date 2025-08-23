'use client';

export default function FriendsPage() {
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Friends</h1>
      <p style={{ marginTop: 8, color: '#606375' }}>
        Recipes from your friends will appear here. 
      </p>

      <div
        style={{
          marginTop: 12,
          padding: 16,
          border: '1px solid #e6e7ee',
          borderRadius: 10,
          background: '#fff',
        }}
      >
        <b>Nothing yet.</b> Once you add friends and they post recipes, their posts will show here.
      </div>
    </div>
  );
}
