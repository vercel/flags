import Image, { type ImageProps } from 'next/image';
import styles from './theme-aware-image.module.css';

type Props = ImageProps & { src: never; srcLight: string; srcDark: string };

export function ThemeAwareImage({
  srcLight,
  srcDark,
  className,
  ...rest
}: Props) {
  return (
    <>
      <Image
        {...rest}
        className={[styles.image, className].join(' ')}
        data-theme="light"
        src={srcLight}
      />
      <Image
        {...rest}
        className={[styles.image, className].join(' ')}
        data-theme="dark"
        src={srcDark}
      />
    </>
  );
}
