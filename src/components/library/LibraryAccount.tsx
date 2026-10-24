import { LogIn, LogOut, RefreshCw, Settings2, UserRound, X } from 'lucide-react';
import type useLibraryAccount from '../../hooks/useLibraryAccount';
import Disclosure from '../ui/Disclosure';

interface Props {
  connection: ReturnType<typeof useLibraryAccount>;
  disabled: boolean;
  selectedPlaylist?: string;
  onPlaylist: (id: string, title: string) => void;
}

export default function LibraryAccount({
  connection,
  disabled,
  selectedPlaylist,
  onPlaylist
}: Props) {
  const { account, working, playlists, nextPageToken, loadingPlaylists } = connection;
  const connecting = connection.operationKind === 'connect' || account?.connecting;
  return (
    <section className="library-account" aria-label="Compte YouTube">
      <div className="library-account-bar">
        <span className="library-account-icon" aria-hidden="true">
          <UserRound size={18} />
        </span>
        <div className="library-account-name">
          <strong>
            {account?.connected
              ? account.channel?.title || 'Compte connecté'
              : 'Votre compte YouTube'}
          </strong>
          {!account?.configured && account && <span>Connexion Google à configurer</span>}
          {connecting && <span role="status">Terminez la connexion dans votre navigateur.</span>}
        </div>
        {working && !connecting ? (
          <span
            className="spinner"
            aria-label={
              connection.operationKind === 'disconnect' ? 'Déconnexion…' : 'Configuration…'
            }
            role="status"
          />
        ) : connecting ? (
          <button type="button" className="text-button" onClick={() => void connection.cancel()}>
            <X size={14} aria-hidden="true" />
            Annuler la connexion
          </button>
        ) : account?.connected ? (
          <>
            <button
              type="button"
              className="icon-button"
              aria-label="Actualiser les playlists du compte"
              disabled={disabled || loadingPlaylists}
              onClick={() => void connection.refreshPlaylists()}
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => void connection.disconnect()}
            >
              <LogOut size={14} aria-hidden="true" />
              Déconnecter
            </button>
          </>
        ) : (
          <>
            {account && !account.configured && (
              <button
                type="button"
                className="text-button"
                disabled={disabled}
                onClick={() => void connection.configure()}
              >
                <Settings2 size={14} aria-hidden="true" />
                Configurer
              </button>
            )}
            <button
              type="button"
              className="button button-secondary"
              disabled={disabled || !account?.configured}
              onClick={() => void connection.connect()}
            >
              <LogIn size={15} aria-hidden="true" />
              Connecter YouTube
            </button>
          </>
        )}
      </div>
      {account?.error && (
        <p className="library-account-error" role="status">
          {account.error}
        </p>
      )}
      {account?.connected && account.channel && (
        <div className="library-account-browser">
          <button
            type="button"
            className={`library-playlist-button ${selectedPlaylist === account.channel.uploadsPlaylistId ? 'is-active' : ''}`}
            disabled={disabled}
            onClick={() => onPlaylist(account.channel!.uploadsPlaylistId, 'Mes vidéos')}
            aria-pressed={selectedPlaylist === account.channel.uploadsPlaylistId}
          >
            Mes vidéos
          </button>
          <Disclosure title={`Mes playlists${playlists.length ? ` (${playlists.length})` : ''}`}>
            {loadingPlaylists && !playlists.length && (
              <p className="library-help" role="status">
                Chargement des playlists…
              </p>
            )}
            {!loadingPlaylists && !playlists.length && (
              <p className="library-help">Aucune playlist dans ce compte.</p>
            )}
            <ul className="library-playlists">
              {playlists.map((playlist) => (
                <li key={playlist.id}>
                  <button
                    type="button"
                    className={`library-playlist-button ${selectedPlaylist === playlist.id ? 'is-active' : ''}`}
                    disabled={disabled}
                    onClick={() => onPlaylist(playlist.id, playlist.title)}
                    aria-pressed={selectedPlaylist === playlist.id}
                  >
                    <span>{playlist.title}</span>
                    <span className="library-help">{playlist.videoCount} vidéos</span>
                  </button>
                </li>
              ))}
            </ul>
            {nextPageToken && (
              <button
                type="button"
                className="text-button"
                disabled={disabled || loadingPlaylists}
                onClick={() => void connection.refreshPlaylists(nextPageToken)}
              >
                {loadingPlaylists ? 'Chargement…' : 'Plus de playlists'}
              </button>
            )}
          </Disclosure>
        </div>
      )}
    </section>
  );
}
