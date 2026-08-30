export default function EmptyPanel() {
  return (
    <section className="empty-panel reveal-up delay-1" aria-label="Étapes du téléchargement">
      <div><span>1</span><strong>Colle le lien</strong><p>Depuis YouTube</p></div>
      <i aria-hidden="true">→</i>
      <div><span>2</span><strong>Choisis la qualité</strong><p>Résolution et poids</p></div>
      <i aria-hidden="true">→</i>
      <div><span>3</span><strong>Télécharge</strong><p>MP4 compatible</p></div>
    </section>
  );
}
