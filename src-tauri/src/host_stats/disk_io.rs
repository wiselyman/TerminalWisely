use crate::types::DiskIoCounter;

const DISKSTATS_SECTOR_BYTES: u64 = 512;

pub fn is_whole_disk_device(name: &str) -> bool {
    if name.starts_with("loop") || name.starts_with("ram") || name.starts_with("fd") {
        return false;
    }
    if name.starts_with("nvme") {
        return !name.contains('p');
    }
    if name.len() == 3 {
        let bytes = name.as_bytes();
        if (bytes[0] == b's' || bytes[0] == b'v' || bytes[0] == b'h') && bytes[1] == b'd' {
            return bytes[2].is_ascii_alphabetic();
        }
    }
    if name.len() == 4 && name.starts_with("xvd") {
        return name.as_bytes()[3].is_ascii_alphabetic();
    }
    if name.starts_with("mmcblk") && !name.contains('p') {
        return true;
    }
    false
}

#[cfg(unix)]
pub fn read_linux_disk_io() -> DiskIoCounter {
    read_diskstats_from(std::fs::read_to_string("/proc/diskstats").unwrap_or_default())
}

#[cfg(not(unix))]
pub fn read_linux_disk_io() -> DiskIoCounter {
    DiskIoCounter::default()
}

pub fn read_diskstats_from(content: String) -> DiskIoCounter {
    let mut read_bytes = 0u64;
    let mut write_bytes = 0u64;

    for line in content.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 10 {
            continue;
        }
        let name = fields[2];
        if !is_whole_disk_device(name) {
            continue;
        }
        let Ok(read_sectors) = fields[5].parse::<u64>() else {
            continue;
        };
        let Ok(write_sectors) = fields[9].parse::<u64>() else {
            continue;
        };
        read_bytes = read_bytes.saturating_add(read_sectors.saturating_mul(DISKSTATS_SECTOR_BYTES));
        write_bytes = write_bytes.saturating_add(write_sectors.saturating_mul(DISKSTATS_SECTOR_BYTES));
    }

    DiskIoCounter {
        read_bytes,
        write_bytes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whole_disk_filter() {
        assert!(is_whole_disk_device("sda"));
        assert!(is_whole_disk_device("nvme0n1"));
        assert!(!is_whole_disk_device("sda1"));
        assert!(!is_whole_disk_device("nvme0n1p1"));
        assert!(!is_whole_disk_device("loop0"));
    }

    #[test]
    fn parse_diskstats() {
        let sample = "   8       0 sda 100 0 2048 50 20 0 4096 80 0 0 0 0 0 0\n\
                      259       0 nvme0n1 50 0 1024 25 10 0 2048 40 0 0 0 0 0 0\n\
                      7       0 loop0 999 0 9999 0 0 0 0 0 0 0 0 0 0 0\n";
        let io = read_diskstats_from(sample.to_string());
        assert_eq!(io.read_bytes, (2048 + 1024) * 512);
        assert_eq!(io.write_bytes, (4096 + 2048) * 512);
    }
}
