
        if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            location.replace('https:' + location.href.substring(5));
        }
    