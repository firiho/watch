'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import Image from 'next/image';
import styles from './movie-card.module.css';
import { useWatchlist } from '@/context/watchlist-context';
import { useAuth } from '@/context/auth-context';
import { useModal } from '@/context/modal-context';
import { useReminders } from '@/context/reminder-context';
import { useRecommendations } from '@/context/recommendations-context';
import { useToggleReminder } from '@/hooks/use-toggle-reminder';
import StarRating from '@/components/star-rating/star-rating';
import { HOVER_OPEN_DELAY_MS, PROVIDER_FETCH_DELAY_MS } from '@/lib/constants';
import { ADMIN_NAME } from '@/lib/admin';
import { formatDisplayDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';

interface WatchProvider {
  id: number;
  name: string;
  logo: string;
}

interface MovieCardProps {
  id: number;
  title: string;
  year: string;
  releaseDate?: string;
  image: string;
  backdrop?: string;
  rating: string;
  description?: string;
  quality?: string;
  mediaType?: 'movie' | 'tv';
  isHD?: boolean;
  /** Load the poster eagerly (above-the-fold cards, e.g. a grid's first rows) for a faster LCP. */
  eager?: boolean;
}

/**
 * Where the hover panel sits: `shift` nudges it (px) so it stays inside the visible rail /
 * viewport, `originX` (%) keeps it growing out of the card's center.
 */
interface Placement {
  shift: number;
  originX: number;
}

/** Phones: 2-up grids and ~2.5-up rails. Tablets: 3-up. Desktop: fixed ~250px cards. */
const POSTER_SIZES = '(max-width: 768px) 46vw, (max-width: 1200px) 30vw, 250px';
/** The hover panel is 150% of the card width (~375px), centered on the card. */
const PANEL_SCALE = 1.5;
const BACKDROP_SIZES = '400px';
/** Minimum distance kept between the panel and the edge of the visible area. */
const PANEL_EDGE_GAP = 12;
/** Must match the panel's exit transition in movie-card.module.css. */
const PANEL_EXIT_MS = 180;
/** Hover expansion only exists with a real mouse on a desktop-sized layout. */
const HOVER_EXPAND_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 769px)';

/** Provider logos render at 24px; TMDB's w92 is plenty (the API hands back `original`). */
const smallLogo = (url: string) => url.replace('/t/p/original/', '/t/p/w92/');

const MovieCard = ({
  id,
  title,
  year,
  releaseDate,
  image,
  backdrop,
  rating,
  description,
  mediaType = 'movie',
  isHD: initialIsHD,
  eager = false,
}: MovieCardProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedRef = useRef(false);

  const [expanded, setExpanded] = useState(false);
  // Keeps the card raised above its neighbours while the panel animates out.
  const [closing, setClosing] = useState(false);
  // The panel mounts on first mouse hover and stays mounted so later hovers animate instantly.
  const [panelMounted, setPanelMounted] = useState(false);
  const [backdropRequested, setBackdropRequested] = useState(false);
  const [backdropLoaded, setBackdropLoaded] = useState(false);
  const [placement, setPlacement] = useState<Placement>({ shift: 0, originX: 50 });

  const [providers, setProviders] = useState<WatchProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [adding, setAdding] = useState(false);
  const [isBtnHovered, setIsBtnHovered] = useState(false);
  const [isHD, setIsHD] = useState(initialIsHD);

  const { isInList, addItem, removeItem, getRating, setRating } = useWatchlist();
  const { getRecommendation } = useRecommendations();
  const { hasReminder } = useReminders();
  const { toggleReminder } = useToggleReminder();
  const { user, isAdmin } = useAuth();
  const { openModal, activeItem } = useModal();
  const inList = isInList(id);
  const myRating = getRating(id);
  const rec = getRecommendation(id, mediaType);
  const reminderOn = hasReminder(id);
  const formattedReleaseDate = formatDisplayDate(releaseDate);
  const hasYear = Boolean(year && year !== 'N/A');

  // Streaming providers load lazily, only once the card has been hover-expanded.
  useEffect(() => {
    if (!expanded || hasFetched) return;
    const controller = new AbortController();

    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/providers?id=${id}&type=${mediaType}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Failed to fetch from proxy');
        const data = await response.json();
        setProviders(data.providers || []);
        if (data.isHD !== undefined) setIsHD(data.isHD);
        setHasFetched(true);
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          console.error('Failed to fetch providers:', error);
          setHasFetched(true); // don't hammer the API on a real failure
        }
      } finally {
        setLoading(false);
      }
    }, PROVIDER_FETCH_DELAY_MS);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [expanded, hasFetched, id, mediaType]);

  const collapse = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!expandedRef.current) return;
    expandedRef.current = false;
    setExpanded(false);
    setClosing(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setClosing(false);
    }, PANEL_EXIT_MS);
  }, []);

  // Never leave a card expanded behind the detail modal.
  useEffect(() => {
    if (activeItem) collapse();
  }, [activeItem, collapse]);

  useEffect(
    () => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    []
  );

  // Keep the panel inside the rail's visible area (or the viewport in grids), even for a card
  // that is only partly scrolled into view.
  const computePlacement = (): Placement => {
    const el = wrapperRef.current;
    if (!el) return { shift: 0, originX: 50 };
    const rect = el.getBoundingClientRect();
    const scroller = el.closest<HTMLElement>('[data-rail-scroller]');
    const bounds = scroller
      ? scroller.getBoundingClientRect()
      : { left: 0, right: document.documentElement.clientWidth };
    const panelWidth = rect.width * PANEL_SCALE;
    const naturalLeft = rect.left - (panelWidth - rect.width) / 2;
    const minLeft = bounds.left + PANEL_EDGE_GAP;
    const maxLeft = Math.max(minLeft, bounds.right - PANEL_EDGE_GAP - panelWidth);
    const left = Math.min(Math.max(naturalLeft, minLeft), maxLeft);
    const originX = ((rect.left + rect.width / 2 - left) / panelWidth) * 100;
    return {
      shift: Math.round(left - naturalLeft),
      originX: Math.round(Math.min(100, Math.max(0, originX))),
    };
  };

  // Mouse only: on touch a tap opens the modal straight away (no sticky hover state on iOS).
  const handlePointerEnter = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    if (!window.matchMedia(HOVER_EXPAND_QUERY).matches) return;
    if (!panelMounted) setPanelMounted(true);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setPlacement(computePlacement());
      setBackdropRequested(true);
      setClosing(false);
      expandedRef.current = true;
      setExpanded(true);
    }, HOVER_OPEN_DELAY_MS);
  };

  const handlePointerLeave = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    collapse();
  };

  const handleOpen = () => {
    collapse();
    openModal(id, mediaType);
  };

  const handleToggleWatchlist = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (!user || adding) return;

    haptic(inList ? 'light' : 'success');
    setAdding(true);
    try {
      if (inList) {
        await removeItem(id);
      } else {
        await addItem({
          id,
          title,
          overview: description,
          poster_path: image.replace('https://image.tmdb.org/t/p/w500', ''),
          backdrop_path: backdrop?.replace('https://image.tmdb.org/t/p/w780', '') || '',
          release_date: year,
          vote_average: parseFloat(rating),
        }, mediaType);
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleToggleReminder = (e: ReactMouseEvent) => {
    e.stopPropagation();
    haptic('selection');
    toggleReminder({ id, title, mediaType });
  };

  const openLabel = [
    hasYear ? `${title} (${year})` : title,
    mediaType === 'tv' ? 'TV show' : 'Movie',
    rec ? `${ADMIN_NAME} rates it ${rec.stars} out of 5` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      ref={wrapperRef}
      className={styles.cardWrapper}
      data-expanded={expanded ? '' : undefined}
      data-raised={expanded || closing ? '' : undefined}
      style={
        panelMounted
          ? ({
              '--panel-shift': `${placement.shift}px`,
              '--panel-origin-x': `${placement.originX}%`,
            } as CSSProperties)
          : undefined
      }
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {/* Resting poster */}
      <div className={styles.card}>
        <Image
          src={image}
          alt=""
          fill
          sizes={POSTER_SIZES}
          loading={eager ? 'eager' : undefined}
          className={styles.posterImage}
          draggable={false}
        />

        {/* Flambeau's public rating, on every card that has one */}
        {rec && (
          <span className={styles.recBadge}>
            <span className={styles.recLabel}>Rec</span>
            <StarRating value={rec.stars} size="xs" tone="accent" />
          </span>
        )}

        <div className={styles.simpleTitle}>
          <h3 className={styles.title}>{title}</h3>
          {formattedReleaseDate && <p className={styles.simpleReleaseDate}>{formattedReleaseDate}</p>}
          {/* The admin's own rating already shows as the Rec badge */}
          {user && !isAdmin && inList && myRating && (
            <StarRating value={myRating} size="xs" className={styles.simpleRating} />
          )}
        </div>
      </div>

      {/* The whole card is one real button: tap / click / Enter / Space open the detail modal. */}
      <button type="button" className={styles.hitArea} onClick={handleOpen} aria-label={openLabel} />

      {/* Desktop hover panel (mouse only) */}
      {panelMounted && (
        <div className={styles.panel} onClick={handleOpen} aria-hidden={!expanded} inert={!expanded}>
          <div className={`${styles.panelMedia} ${backdrop ? '' : styles.panelMediaPoster}`}>
            <Image src={image} alt="" fill sizes={POSTER_SIZES} className={styles.panelPoster} draggable={false} />
            {backdrop && backdropRequested && (
              <Image
                src={backdrop}
                alt=""
                fill
                sizes={BACKDROP_SIZES}
                className={styles.panelBackdrop}
                data-loaded={backdropLoaded ? '' : undefined}
                onLoad={() => setBackdropLoaded(true)}
                draggable={false}
              />
            )}

            <div className={styles.imageGradient} />

            {/* Providers float on the image */}
            {(loading || hasFetched) && (
              <div className={styles.providerOverlay}>
                {loading ? (
                  <span className={styles.spinner} role="status" aria-label="Loading streaming services" />
                ) : providers.length > 0 ? (
                  <div className={styles.providerLogos}>
                    {providers.map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={p.id}
                        src={smallLogo(p.logo)}
                        alt={p.name}
                        title={p.name}
                        className={styles.providerLogo}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    ))}
                  </div>
                ) : (
                  <span className={styles.noProviders}>No streaming</span>
                )}
              </div>
            )}

            {!loading && hasFetched && mediaType === 'movie' && (
              <div className={styles.topRightBadges}>
                <span className={`${styles.cardBadge} ${isHD ? styles.hdBadge : styles.sdBadge}`}>
                  {isHD ? 'HD' : 'SD'}
                </span>
              </div>
            )}
          </div>

          <div className={styles.panelContent}>
            <h3 className={styles.expandedTitle}>{title}</h3>

            <div className={styles.meta}>
              <span className={styles.rating}>★ {rating}</span>
              {hasYear && (
                <>
                  <span className={styles.dot} aria-hidden="true">·</span>
                  <span className={styles.year}>{year}</span>
                </>
              )}
              <span className={styles.dot} aria-hidden="true">·</span>
              <span className={styles.mediaTag}>{mediaType === 'tv' ? 'TV' : 'Movie'}</span>
              {user && inList && !isHD && (
                <button
                  type="button"
                  className={`${styles.bellIcon} ${reminderOn ? styles.active : ''}`}
                  title={reminderOn ? 'Remove Reminder' : 'Set Reminder'}
                  aria-label={reminderOn ? 'Remove reminder' : 'Set reminder'}
                  aria-pressed={reminderOn}
                  onClick={handleToggleReminder}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.64 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z" />
                  </svg>
                </button>
              )}
            </div>

            {((rec && !isAdmin) || (user && inList)) && (
              <div className={styles.ratings}>
                {rec && !isAdmin && (
                  <div className={styles.ratingRow}>
                    <span className={styles.ratingLabel}>{ADMIN_NAME}&apos;s rating</span>
                    <StarRating value={rec.stars} size="sm" tone="accent" />
                  </div>
                )}
                {user && inList && (
                  <div className={styles.ratingRow}>
                    <span className={styles.ratingLabel}>{isAdmin ? 'Recommend' : 'Your rating'}</span>
                    <StarRating
                      value={myRating}
                      onChange={(stars) => {
                        haptic('selection');
                        setRating(id, stars);
                      }}
                      label={isAdmin ? `Recommend ${title}` : `Rate ${title}`}
                    />
                  </div>
                )}
              </div>
            )}

            {description && <p className={styles.description}>{description}</p>}

            {formattedReleaseDate && (
              <p className={styles.releaseDateLine}>
                {mediaType === 'tv' ? 'First aired' : 'Released'} {formattedReleaseDate}
              </p>
            )}

            {user && (
              <button
                type="button"
                className={`${styles.addButton} ${inList ? styles.inList : ''}`}
                onClick={handleToggleWatchlist}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setIsBtnHovered(true);
                }}
                onPointerLeave={() => setIsBtnHovered(false)}
                disabled={adding}
              >
                {adding ? (
                  <span className={styles.btnSpinner} aria-label="Saving" />
                ) : inList ? (
                  isBtnHovered ? '− Remove from My List' : '✓ In My List'
                ) : (
                  '+ Add to My List'
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(MovieCard);
