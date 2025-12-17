# Bible Reading Plan

A simple Progressive Web App (PWA) for tracking daily Bible reading using the M'Cheyne reading plan.

## Features

- **M'Cheyne Reading Plan**: 4 daily readings covering the whole Bible in a year
- **Progress Tracking**: Mark days as complete and track your streak
- **Offline Support**: Works without internet once installed
- **Daily Reminders**: Set a daily calendar reminder at your preferred time
- **Dark Mode**: Automatically adapts to your device settings

## How to Use

### On iPhone (Recommended)

1. Open Safari and go to: `https://liam-machine.github.io/bible-readings`
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add** in the top right
5. Open the app from your home screen
6. Select your start date and begin!

### Setting Up Daily Reminders

1. Open the app and tap the **Settings** gear icon
2. Choose your preferred reminder time
3. Tap **Add to Calendar**
4. Open the downloaded file to add the reminder to your calendar
5. You'll get a notification at that time every day!

## The M'Cheyne Plan

Robert Murray M'Cheyne (1813-1843) was a Scottish minister who created this reading plan. Each day includes 4 readings:

1. **Old Testament** - Genesis through Malachi
2. **New Testament Gospels** - Matthew through John
3. **Old Testament Poetry/Wisdom** - Ezra through Malachi
4. **New Testament Epistles** - Acts through Revelation

By the end of the year, you'll have read the Old Testament once and the New Testament twice!

## Development

This is a static PWA with no build step required.

### Files

```
bible-readings/
├── index.html          # Main app page
├── app.js              # Application logic
├── styles.css          # Styling
├── manifest.json       # PWA manifest
├── service-worker.js   # Offline caching
├── icon-192.png        # App icon (small)
├── icon-512.png        # App icon (large)
├── data/
│   └── mcheyne.json    # Reading plan data
└── README.md           # This file
```

### Running Locally

```bash
# Using Python
python3 -m http.server 8000

# Or using Node.js
npx serve
```

Then open `http://localhost:8000` in your browser.

### Data Source

Reading plan data from [khornberg/readingplans](https://github.com/khornberg/readingplans).

## License

MIT
