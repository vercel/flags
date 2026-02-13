import { clsx } from 'clsx';
import styles from './hero-image.module.css';

const HeroImage = () => (
  // biome-ignore lint/performance/noImgElement: raw img avoids flicker with Next Image
  <img
    src="https://mxikj9vd8fb4tfe4.public.blob.vercel-storage.com/marketing/light-gradient-mxu3khHWJ11kkIsInB08oGeEapbXuY.png"
    alt="Hero"
    fetchPriority="high"
    className={clsx(styles.image, 'dark:invert')}
  />
);

export default HeroImage;
