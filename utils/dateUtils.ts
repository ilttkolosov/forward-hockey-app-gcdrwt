/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};F/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};i/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};l/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};e/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
}; /**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};d/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};o/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};e/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};s/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
}; /**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};n/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};o/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};t/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
}; /**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};e/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};x/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};i/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};s/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};t/**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};./**
 * Date formatting utilities for the hockey app
 */

/**
 * Formats a game date string for display
 * @param dateString - Date string from API (e.g., "2025-10-04 00:00:31")
 * @returns Formatted date string
 */
export const formatGameDate = (dateString: string): string => {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return dateString;
    }
    
    // Extract time components
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Format the date part
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    // Check if time is 00:00 (midnight)
    if (hours === 0 && minutes === 0) {
      // Return only date without time and without "г."
      return formattedDate;
    } else {
      // Return date with time, without "г."
      const timeString = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${formattedDate} • ${timeString}`;
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Calculates season from game date
 * @param dateString - Date string from API
 * @returns Season string (e.g., "Сезон 2025-2026")
 */
export const getSeasonFromGameDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Season runs from July 1 to May 31
    // If month is July (7) or later, it's the start of the season
    // If month is June (6) or earlier, it's the end of the season
    if (month >= 7) {
      // July to December - start of season
      return `Сезон ${year}-${year + 1}`;
    } else {
      // January to June - end of season
      return `Сезон ${year - 1}-${year}`;
    }
  } catch (error) {
    console.error('Error calculating season from date:', error);
    return 'Неизвестный сезон';
  }
};

/**
 * Formats date and time without seconds for match details
 * @param dateString - Date string from API
 * @returns Object with formatted date and time
 */
export const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
  try {
    const date = new Date(dateString);
    
    // Format date in Russian
    const formattedDate = date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Format time without seconds
    const formattedTime = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return { formattedDate, formattedTime };
  } catch (error) {
    console.error('Error formatting date and time:', error);
    return { formattedDate: dateString, formattedTime: '' };
  }
};