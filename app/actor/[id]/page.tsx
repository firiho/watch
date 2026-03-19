export default async function ActorPage({ params }: { params: { id: string } }) {
  // You can flesh this out more with TMDB API calls! 
  // For now, it provides a nice placeholder so the links don't output a 404
  return (
    <main style={{ padding: '100px 40px', minHeight: '100vh' }}>
      <h1>Actor Profile: {params.id}</h1>
      <p>More actor details coming soon...</p>
    </main>
  );
}