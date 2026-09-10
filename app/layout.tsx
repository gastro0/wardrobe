import type { Metadata, Viewport } from "next";
import "./globals.css";
export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#ffffff"};
export const metadata: Metadata = {title:"Форма — гардероб и погода",description:"Сохраняйте вещи, собирайте образы и выбирайте одежду по погоде в вашем городе.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ru"><body>{children}</body></html>}
