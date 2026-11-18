import React, { useEffect, useState } from 'react';

const IMAGE_MS = 8000;

const KioskBranding = ({ media = [] }) => {
    const [index, setIndex] = useState(0);
    const items = Array.isArray(media) ? media.filter((m) => m?.url) : [];

    useEffect(() => {
        setIndex(0);
    }, [items.length]);

    useEffect(() => {
        if (items.length < 2) return;
        const current = items[index % items.length];
        if (!current || current.type === 'video') return undefined;
        const timer = setTimeout(() => {
            setIndex((i) => (i + 1) % items.length);
        }, IMAGE_MS);
        return () => clearTimeout(timer);
    }, [index, items]);

    if (!items.length) return null;

    const current = items[index % items.length];

    return (
        <div className="kiosk-branding" aria-hidden="true">
            {current.type === 'video' ? (
                <video
                    key={current.url}
                    src={current.url}
                    autoPlay
                    muted
                    playsInline
                    onEnded={() => setIndex((i) => (i + 1) % items.length)}
                />
            ) : (
                <img key={current.url} src={current.url} alt="" />
            )}
            <div className="kiosk-branding-fade" />
        </div>
    );
};

export default KioskBranding;
